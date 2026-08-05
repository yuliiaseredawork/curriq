"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { createApiClient } from "@/lib/api";
import {
  pageShell,
  readingContainer,
  ghostLink,
  primaryCard,
  primaryButtonClass,
} from "@/lib/ui";

export default function AccountPage() {
  const { getToken, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const api = createApiClient(getToken);
  const [account, setAccount] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    void api
      .getAccount()
      .then((result) => setAccount(result.account))
      .catch((error) => setMessage(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  async function downloadExport() {
    setBusy(true);
    try {
      const blob = await api.exportAccountData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "curriq-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Permanently delete your Curriq account, courses, uploads, and learning history? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteAccount();
      await signOut({ redirectUrl: "/" });
    } catch (error: any) {
      setMessage(error.message ?? "Account deletion failed");
      setBusy(false);
    }
  }

  async function sendFeedback() {
    if (feedback.trim().length < 3) return;
    await api.submitFeedback({
      kind: "feedback",
      message: feedback,
      path: window.location.pathname,
    });
    setFeedback("");
    setMessage("Thanks — your feedback was sent.");
  }

  return (
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <Link href="/" className={ghostLink}>
          ← Home
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>
        {message && <p className="text-sm text-blue-200">{message}</p>}

        <section className={`${primaryCard} space-y-3`}>
          <h2 className="text-lg font-semibold">Plan and usage</h2>
          <p className="text-sm text-gray-300">
            {account?.plan === "PRO" && account?.subscriptionStatus === "ACTIVE"
              ? "Pro — up to 500 AI requests per day."
              : "Free — up to 20 AI requests per day."}
          </p>
          <button
            className={primaryButtonClass}
            onClick={async () => {
              const result = account?.stripeCustomerId
                ? await api.openBillingPortal()
                : await api.startSubscriptionCheckout();
              window.location.assign(result.url);
            }}
          >
            {account?.stripeCustomerId ? "Manage billing" : "Upgrade to Pro"}
          </button>
        </section>

        <section className={`${primaryCard} space-y-3`}>
          <h2 className="text-lg font-semibold">Email</h2>
          <label className="flex items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={account?.emailSubscribed !== false}
              onChange={async (event) => {
                const subscribed = event.target.checked;
                await api.setEmailSubscribed(subscribed);
                setAccount((value: any) => ({
                  ...value,
                  emailSubscribed: subscribed,
                }));
              }}
            />
            Send daily review reminders
          </label>
        </section>

        <section className={`${primaryCard} space-y-3`}>
          <h2 className="text-lg font-semibold">Feedback and support</h2>
          <textarea
            className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
            value={feedback}
            maxLength={2000}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="What should we improve?"
          />
          <button className={primaryButtonClass} onClick={sendFeedback}>
            Send feedback
          </button>
        </section>

        <section className={`${primaryCard} space-y-3`}>
          <h2 className="text-lg font-semibold">Your data</h2>
          <button
            disabled={busy}
            className={ghostLink}
            onClick={downloadExport}
          >
            Download data export
          </button>
          <button
            disabled={busy}
            className="block text-sm font-medium text-red-300 hover:text-red-200"
            onClick={deleteAccount}
          >
            Permanently delete account
          </button>
        </section>
      </div>
    </main>
  );
}
