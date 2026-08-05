import Link from "next/link";
import {
  HOME_HERO_EYEBROW,
  HOME_HERO_HEADLINE,
  HOME_VALUE_PROP,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/learnerCopy";
import {
  LANDING_NAV_SIGN_IN_LABEL,
  LANDING_NAV_CTA_LABEL,
  LANDING_PRIMARY_CTA_LABEL,
  LANDING_SOURCE_HINT,
  LANDING_SIGN_UP_LINK_LABEL,
  LANDING_AUDIENCE,
  HOW_IT_WORKS_LABEL,
  HOW_IT_WORKS_STEPS,
  VALUE_CARDS,
  FOCUSED_LEARNING_LABEL,
  FOCUSED_LEARNING_POINTS,
  LANDING_PRICING_LABEL,
  LANDING_PRICING_TITLE,
  LANDING_PRICING_BODY,
  LANDING_FAQ_LABEL,
  LANDING_FAQ,
  LANDING_WALKTHROUGH_TITLE,
  LANDING_WALKTHROUGH_BODY,
  LANDING_FOOTER_LINKS,
  PREVIEW_CTA_CAPTION,
} from "@/lib/landingCopy";
import {
  pageShell,
  eyebrow,
  primaryCard,
  subtleCard,
  ghostLink,
} from "@/lib/ui";
import { ProductPreview } from "./ProductPreview";

/**
 * Public, signed-out landing page at "/". Pure presentation, positioned around
 * the interview-prep wedge: retention (mistake detection + spaced review) leads;
 * ingestion is a supporting feature. The primary CTA is the no-signup demo
 * course (/demo) — signup comes after value. Pitch-critical hero copy comes
 * from learnerCopy.ts so the landing, sign-in first touch, and dashboard hero
 * never drift apart.
 */
export function Landing() {
  return (
    <main className={pageShell}>
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8">
        <nav className="flex items-center justify-between gap-4 py-2">
          <span
            className="text-2xl font-bold tracking-tight"
            aria-label="Curriq"
          >
            Curri<span className="text-blue-400">q</span>
          </span>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className={ghostLink}>
              {LANDING_NAV_SIGN_IN_LABEL}
            </Link>
            <Link
              href="/demo"
              className={`${secondaryButtonClass} px-4 py-2 text-sm`}
            >
              {LANDING_NAV_CTA_LABEL}
            </Link>
          </div>
        </nav>

        {/* Hero: the pitch, in 5 seconds — try the demo before signing up. */}
        <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-5">
            <div className={`${eyebrow} text-blue-300/90`}>
              {HOME_HERO_EYEBROW}
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              {HOME_HERO_HEADLINE}
            </h1>
            <p className="max-w-xl text-lg text-gray-300">{HOME_VALUE_PROP}</p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/demo"
                className={`${primaryButtonClass} px-6 py-3 text-base shadow-md shadow-blue-900/50`}
              >
                {LANDING_PRIMARY_CTA_LABEL} →
              </Link>
              <p className="text-sm text-gray-500">{LANDING_SOURCE_HINT}</p>
            </div>
            <p className="max-w-xl text-sm text-gray-500">{LANDING_AUDIENCE}</p>
          </div>

          {/* The preview is real and clickable — it opens the playable demo. */}
          <Link href="/demo" className="group block">
            <ProductPreview />
            <p className="mt-2 text-center text-xs text-gray-500 transition group-hover:text-gray-300">
              {PREVIEW_CTA_CAPTION} →
            </p>
          </Link>
        </section>

        {/* How it works. */}
        <section className="space-y-6 py-10 sm:py-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            {HOW_IT_WORKS_LABEL}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <div key={step.title} className={`${subtleCard} space-y-2 p-5`}>
                <div className={eyebrow}>Step {i + 1}</div>
                <h3 className="font-medium text-gray-100">{step.title}</h3>
                <p className="text-sm text-gray-400">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Value cards — retention loop first, not ingestion. */}
        <section className="grid gap-4 py-10 sm:grid-cols-3 sm:py-14">
          {VALUE_CARDS.map((card) => (
            <div key={card.title} className={`${primaryCard} space-y-2 p-6`}>
              <h3 className="text-lg font-semibold tracking-tight">
                {card.title}
              </h3>
              <p className="text-sm text-gray-400">{card.body}</p>
            </div>
          ))}
        </section>

        {/* Walkthrough placeholder + positioning strip. */}
        <section className="grid gap-4 py-10 sm:py-14 lg:grid-cols-2">
          <div
            className={`${subtleCard} flex flex-col justify-center gap-2 p-6`}
          >
            <h2 className="text-sm font-medium text-gray-200">
              {LANDING_WALKTHROUGH_TITLE}
            </h2>
            <p className="text-sm text-gray-500">{LANDING_WALKTHROUGH_BODY}</p>
            <Link
              href="/demo"
              className="text-sm text-blue-300 hover:text-blue-200"
            >
              Open the interactive demo →
            </Link>
          </div>
          <div
            className={`${subtleCard} flex flex-col justify-center gap-4 p-6`}
          >
            <h2 className="text-sm font-medium text-gray-200">
              {FOCUSED_LEARNING_LABEL}
            </h2>
            <div className="flex flex-wrap gap-2">
              {FOCUSED_LEARNING_POINTS.map((point) => (
                <span
                  key={point}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-400"
                >
                  {point}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing. */}
        <section className="py-10 sm:py-14">
          <div className={`${primaryCard} space-y-2 p-6 text-center`}>
            <div className={eyebrow}>{LANDING_PRICING_LABEL}</div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {LANDING_PRICING_TITLE}
            </h2>
            <p className="mx-auto max-w-xl text-sm text-gray-400">
              {LANDING_PRICING_BODY}
            </p>
          </div>
        </section>

        {/* FAQ. */}
        <section className="space-y-4 py-10 sm:py-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            {LANDING_FAQ_LABEL}
          </h2>
          <div className="space-y-2">
            {LANDING_FAQ.map((item) => (
              <details key={item.q} className={`${subtleCard} p-4`}>
                <summary className="cursor-pointer font-medium text-gray-100">
                  {item.q}
                </summary>
                <p className="mt-2 max-w-prose text-sm text-gray-400">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing CTA. */}
        <section className="flex flex-col items-center gap-4 py-12 text-center sm:py-16">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            {HOME_HERO_HEADLINE}
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/demo"
              className={`${primaryButtonClass} px-6 py-3 text-base shadow-md shadow-blue-900/50`}
            >
              {LANDING_PRIMARY_CTA_LABEL} →
            </Link>
            <Link href="/sign-in" className={ghostLink}>
              {LANDING_SIGN_UP_LINK_LABEL}
            </Link>
          </div>
        </section>

        <footer className="flex flex-col items-center gap-3 border-t border-white/5 py-8 text-xs text-gray-600 sm:flex-row sm:justify-between">
          <span>Curriq — retain what you watch, for the interview.</span>
          <div className="flex gap-4">
            {LANDING_FOOTER_LINKS.map((link) =>
              link.href.startsWith("/") ? (
                <Link
                  key={link.label}
                  href={link.href}
                  className="hover:text-gray-400"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="hover:text-gray-400"
                >
                  {link.label}
                </a>
              ),
            )}
          </div>
        </footer>
      </div>
    </main>
  );
}
