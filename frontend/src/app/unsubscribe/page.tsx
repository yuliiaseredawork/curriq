"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { pageShell, readingContainer, ghostLink } from "@/lib/ui";

function UnsubscribeInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState("Updating your email preferences…");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("This unsubscribe link is incomplete.");
      return;
    }
    void fetch(`${process.env.NEXT_PUBLIC_API_URL}/email/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        setStatus(
          response.ok
            ? "You’re unsubscribed from review reminder emails."
            : "This unsubscribe link is invalid or has expired.",
        );
      })
      .catch(() => setStatus("We couldn’t update your preference. Try again."));
  }, [params]);

  return (
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <Link href="/" className={ghostLink}>
          ← Curriq
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Email preferences</h1>
        <p className="text-gray-300">{status}</p>
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <UnsubscribeInner />
    </Suspense>
  );
}
