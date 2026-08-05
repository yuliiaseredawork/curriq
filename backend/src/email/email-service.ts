// Minimal email-service abstraction. No provider SDK dependency: Resend is
// called over plain HTTPS when RESEND_API_KEY is set; otherwise a console
// provider logs the message and reports itself as a dry run (safe default for
// dev and for environments where email isn't configured yet). SES/Postmark can
// be added later behind the same interface.
//
// Env:
//   RESEND_API_KEY  — enables real sends via Resend
//   EMAIL_FROM      — sender, e.g. "Curriq <reviews@curriq.app>" (required for real sends)

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendResult = {
  ok: boolean;
  provider: "resend" | "console";
  detail?: string;
};

export interface EmailService {
  send(message: EmailMessage): Promise<SendResult>;
}

class ResendEmailService implements EmailService {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => `HTTP ${res.status}`);
      console.error("[email] resend send failed:", res.status, detail);
      return { ok: false, provider: "resend", detail };
    }
    return { ok: true, provider: "resend" };
  }
}

/** Dry-run provider: logs instead of sending. Never throws. */
class ConsoleEmailService implements EmailService {
  async send(message: EmailMessage): Promise<SendResult> {
    console.log("[email] (dry run — no RESEND_API_KEY configured)", {
      subject: message.subject,
    });
    return { ok: true, provider: "console" };
  }
}

export function createEmailService(
  env: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  } = process.env,
): EmailService {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return new ResendEmailService(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new ConsoleEmailService();
}
