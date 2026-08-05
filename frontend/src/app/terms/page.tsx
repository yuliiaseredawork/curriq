import Link from "next/link";
import { pageShell, readingContainer, ghostLink } from "@/lib/ui";

export const metadata = { title: "Terms — Curriq" };

// Placeholder terms for the beta. Replace with reviewed terms before GA.
export default function TermsPage() {
  return (
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <Link href="/" className={ghostLink}>
          ← Curriq
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <div className="max-w-prose space-y-4 text-sm text-gray-300">
          <p>
            Curriq is provided as a free beta, as-is and without warranty.
            Features may change or be unavailable while we build.
          </p>
          <p>
            Only add content you have the right to use. Generated learning
            material is for your personal study.
          </p>
          <p>
            Questions? Email{" "}
            <a
              href="mailto:hello@curriq.app"
              className="text-blue-300 hover:text-blue-200"
            >
              hello@curriq.app
            </a>
            .
          </p>
          <p className="text-gray-500">
            Full terms will be published before general availability.
          </p>
        </div>
      </div>
    </main>
  );
}
