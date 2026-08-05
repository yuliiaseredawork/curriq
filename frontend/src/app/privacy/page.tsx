import Link from "next/link";
import { pageShell, readingContainer, ghostLink } from "@/lib/ui";

export const metadata = { title: "Privacy — Curriq" };
export default function PrivacyPage() {
  return (
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <Link href="/" className={ghostLink}>
          ← Curriq
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
        <div className="max-w-prose space-y-4 text-sm text-gray-300">
          <p>Last updated: August 5, 2026.</p>
          <p>
            Curriq stores your Clerk account identifier and email address,
            imported video URLs, transcripts and PDFs, generated learning
            material, practice history, review schedules, product events, and
            subscription status. We use this data to provide, secure, support,
            and improve the learning service.
          </p>
          <p>
            Clerk processes authentication; AWS hosts application data and
            malware scanning; OpenAI and Anthropic process content needed for
            generation; Resend sends opted-in reminders; and Stripe processes
            subscriptions. We do not sell personal data or use it for
            third-party advertising.
          </p>
          <p>
            Active course data remains until you delete your account. Abandoned
            uploads expire after one day, raw source artifacts after 90 days,
            old object versions after 30 days, analytics after 400 days, and
            encrypted database backups after at most 35 days. Legal,
            fraud-prevention, and billing records may be retained where
            required.
          </p>
          <p>
            In{" "}
            <Link href="/account" className="text-blue-300 hover:text-blue-200">
              Account
            </Link>
            , you can export your data, unsubscribe from reminder emails, or
            permanently delete your account and live data. Deletions age out of
            encrypted backups within the backup window.
          </p>
          <p>
            For access, correction, deletion, or privacy questions, contact{" "}
            <a
              href="mailto:privacy@curriq.app"
              className="text-blue-300 hover:text-blue-200"
            >
              privacy@curriq.app
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
