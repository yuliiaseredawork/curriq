import { Hono } from "hono";
import Stripe from "stripe";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getCurrentUserIdentity } from "../../auth/current-user";
import {
  getAccount,
  getAccountByStripeCustomer,
  updateBillingAccount,
  type Account,
  type SubscriptionStatus,
} from "../../storage/accounts";
import { getProviderSecret } from "../../config/provider-secrets";
import { recordProductEvent } from "../../analytics/events";
import { createEmailService } from "../../email/email-service";

export const billing = new Hono();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
let stripeClient: Stripe | undefined;

async function stripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(await getProviderSecret("STRIPE_SECRET_KEY"), {
      timeout: 20_000,
      maxNetworkRetries: 2,
    });
  }
  return stripeClient;
}

function id(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id: unknown }).id);
  }
  return undefined;
}

async function accountForCustomer(customer: unknown) {
  const customerId = id(customer);
  return customerId ? getAccountByStripeCustomer(customerId) : null;
}

function mappedStatus(status: string): SubscriptionStatus {
  if (status === "active" || status === "trialing") return "ACTIVE";
  if (status === "past_due" || status === "unpaid") return "PAST_DUE";
  if (status === "canceled" || status === "incomplete_expired") {
    return "CANCELED";
  }
  return "NONE";
}

async function saveSubscription(
  account: Account,
  input: { customerId: string; subscriptionId?: string; status: string },
) {
  const subscriptionStatus = mappedStatus(input.status);
  await updateBillingAccount({
    userId: account.userId,
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    plan: subscriptionStatus === "ACTIVE" ? "PRO" : "FREE",
    subscriptionStatus,
  });
}

billing.post("/billing/checkout", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  const existing = await getAccount(identity.userId);
  if (!existing) throw new Error("ACCOUNT_NOT_READY");
  const client = await stripe();
  let customerId = existing.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({
      ...(identity.email ? { email: identity.email } : {}),
      metadata: { clerk_user_id: identity.clerkUserId },
    });
    customerId = customer.id;
    await updateBillingAccount({
      userId: identity.userId,
      customerId,
      plan: existing.plan,
      subscriptionStatus: existing.subscriptionStatus,
    });
  }

  const appUrl = (process.env.APP_URL ?? "https://curriq.app").replace(
    /\/$/,
    "",
  );
  const checkout = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      { price: await getProviderSecret("STRIPE_PRICE_ID"), quantity: 1 },
    ],
    allow_promotion_codes: true,
    success_url: `${appUrl}/account?billing=success`,
    cancel_url: `${appUrl}/account?billing=canceled`,
  });
  return c.json({ url: checkout.url });
});

billing.post("/billing/portal", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  const account = await getAccount(identity.userId);
  if (!account?.stripeCustomerId) {
    return c.json({ error: "NO_BILLING_ACCOUNT" }, 404);
  }
  const portal = await (
    await stripe()
  ).billingPortal.sessions.create({
    customer: account.stripeCustomerId,
    return_url: `${(process.env.APP_URL ?? "https://curriq.app").replace(/\/$/, "")}/account`,
  });
  return c.json({ url: portal.url });
});

async function claimWebhook(eventId: string) {
  await ddb.send(
    new PutCommand({
      TableName: process.env.ANALYTICS_TABLE!,
      Item: {
        pk: `STRIPE_EVENT#${eventId}`,
        sk: "PROCESSING",
        eventName: "stripe_webhook",
        occurredAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

async function releaseWebhook(eventId: string) {
  await ddb.send(
    new DeleteCommand({
      TableName: process.env.ANALYTICS_TABLE!,
      Key: { pk: `STRIPE_EVENT#${eventId}`, sk: "PROCESSING" },
    }),
  );
}

async function completeWebhook(eventId: string) {
  await ddb.send(
    new UpdateCommand({
      TableName: process.env.ANALYTICS_TABLE!,
      Key: { pk: `STRIPE_EVENT#${eventId}`, sk: "PROCESSING" },
      UpdateExpression: "SET completedAt = :now",
      ExpressionAttributeValues: { ":now": new Date().toISOString() },
    }),
  );
}

async function handleWebhook(event: Stripe.Event) {
  const object = event.data.object as any;
  if (event.type === "checkout.session.completed") {
    const account = await accountForCustomer(object.customer);
    const customerId = id(object.customer);
    const subscriptionId = id(object.subscription);
    if (account && customerId && subscriptionId) {
      const subscription = await (
        await stripe()
      ).subscriptions.retrieve(subscriptionId);
      await saveSubscription(account, {
        customerId,
        subscriptionId,
        status: subscription.status,
      });
      if (mappedStatus(subscription.status) === "ACTIVE") {
        await recordProductEvent("billing_started", account.userId);
      }
    }
    return;
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const account = await accountForCustomer(object.customer);
    const customerId = id(object.customer);
    if (account && customerId) {
      await saveSubscription(account, {
        customerId,
        subscriptionId: id(object),
        status:
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : String(object.status),
      });
      if (event.type === "customer.subscription.deleted") {
        await recordProductEvent("subscription_canceled", account.userId);
      }
    }
    return;
  }

  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed"
  ) {
    const account = await accountForCustomer(object.customer);
    const customerId = id(object.customer);
    if (!account || !customerId) return;
    const failed = event.type === "invoice.payment_failed";
    await saveSubscription(account, {
      customerId,
      subscriptionId:
        id(object.subscription) ??
        id(object.parent?.subscription_details?.subscription),
      status: failed ? "past_due" : "active",
    });
    if (failed) {
      await recordProductEvent("billing_failed", account.userId);
      if (account.email) {
        const email = createEmailService({
          RESEND_API_KEY: await getProviderSecret("RESEND_API_KEY").catch(
            () => undefined,
          ),
          EMAIL_FROM: process.env.EMAIL_FROM,
        });
        await email.send({
          to: account.email,
          subject: "Action needed: update your Curriq payment method",
          text: `We could not renew your Curriq subscription. Update your payment method at ${(process.env.APP_URL ?? "https://curriq.app").replace(/\/$/, "")}/account. Your account has moved to free limits until payment succeeds.`,
        });
      }
    }
  }
}

billing.post("/billing/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "MISSING_SIGNATURE" }, 400);
  let event: Stripe.Event;
  try {
    event = (await stripe()).webhooks.constructEvent(
      rawBody,
      signature,
      await getProviderSecret("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    return c.json({ error: "INVALID_SIGNATURE" }, 400);
  }

  try {
    await claimWebhook(event.id);
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      return c.json({ received: true, duplicate: true });
    }
    throw error;
  }

  try {
    await handleWebhook(event);
    await completeWebhook(event.id);
    return c.json({ received: true });
  } catch (error) {
    await releaseWebhook(event.id);
    throw error;
  }
});
