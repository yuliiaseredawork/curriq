import Link from "next/link";
import { pageShell, readingContainer, ghostLink } from "@/lib/ui";

export const metadata = { title: "Privacy — Curriq" };

// Placeholder policy for the beta. Replace with a reviewed policy before GA.
export default function PrivacyPage() {
  return (
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <Link href="/" className={ghostLink}>
          ← Curriq
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Privacy</h1>
        <div className="max-w-prose space-y-4 text-sm text-gray-300">
          <p>
            Curriq is in beta. We store the content you add (video transcripts,
            PDFs), the learning material generated from it, and your practice
            history so the product can schedule your reviews.
          </p>
          <p>
            We don’t sell your data, and we don’t share it with third parties
            for advertising.
          </p>
          <p>
            To delete your account and data, or for any privacy question, email{" "}
            <a
              href="mailto:hello@curriq.app"
              className="text-blue-300 hover:text-blue-200"
            >
              hello@curriq.app
            </a>
            .
          </p>
          <p className="text-gray-500">
            A full privacy policy will be published before general availability.
          </p>
        </div>
      </div>
    </main>
  );
}
