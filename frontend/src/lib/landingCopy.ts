// Copy for the public, signed-out landing page ("/"). The pitch-critical hero
// copy (eyebrow/headline/value prop) is NOT duplicated here — it's imported
// from learnerCopy.ts (HOME_HERO_EYEBROW / HOME_HERO_HEADLINE / HOME_VALUE_PROP)
// so the landing, sign-in first touch, and the dashboard's first-run hero never
// drift apart. Everything below is landing-only.
//
// Positioning: spaced-repetition coach for system design / engineering
// interview prep. The lead is the retention loop (mistake detection + spaced
// review), NOT ingestion — everyone has ingestion.

export const LANDING_NAV_SIGN_IN_LABEL = "Sign in";
export const LANDING_NAV_CTA_LABEL = "Try the demo";

export const LANDING_PRIMARY_CTA_LABEL = "Try the demo course";
export const LANDING_SOURCE_HINT = "No signup needed · ~4 min";
export const LANDING_SIGN_UP_LINK_LABEL = "or sign up free";

export const LANDING_AUDIENCE =
  "For backend engineers and senior candidates prepping system design — Kafka, RabbitMQ, distributed systems, and more.";

export type LandingStep = { title: string; body: string };

export const HOW_IT_WORKS_LABEL = "How it works";
export const HOW_IT_WORKS_STEPS: LandingStep[] = [
  {
    title: "Add a video or PDF",
    body: "Paste a system design video, a playlist, or a PDF you’re studying from.",
  },
  {
    title: "Get a learning path",
    body: "Clear, ordered chapters with outcomes — not a summary dump.",
  },
  {
    title: "Practice like it’s the interview",
    body: "Applied questions grounded in the material, with distractors that catch real mix-ups.",
  },
  {
    title: "Review before you forget",
    body: "Spaced repetition resurfaces your weak concepts right before the interview.",
  },
];

export type LandingValueCard = { title: string; body: string };

export const VALUE_CARDS: LandingValueCard[] = [
  {
    title: "Knows exactly what you mixed up",
    body: "Not just right or wrong — Curriq names the confusion, like “you conflated persistence with reliability,” and targets it.",
  },
  {
    title: "Brings it back before you forget",
    body: "Spaced review is scheduled from your own mistakes, not a generic flashcard deck.",
  },
  {
    title: "Built for the deadline",
    body: "Tell Curriq your interview date — it paces daily review so you’re ready in time.",
  },
];

export const FOCUSED_LEARNING_LABEL = "Built for focused learning";
export const FOCUSED_LEARNING_POINTS: string[] = [
  "No generic quizzes",
  "No passive summaries",
  "One next step at a time",
];

// --- Credibility sections ------------------------------------------------------

export const LANDING_PRICING_LABEL = "Pricing";
export const LANDING_PRICING_TITLE = "Free while in beta";
export const LANDING_PRICING_BODY =
  "Everything is free during the beta. Early users lock in a founding discount when paid plans arrive.";

export type LandingFaqItem = { q: string; a: string };

export const LANDING_FAQ_LABEL = "FAQ";
export const LANDING_FAQ: LandingFaqItem[] = [
  {
    q: "What content works best?",
    a: "System design and backend engineering videos, playlists, and PDFs — anything with a transcript or readable text.",
  },
  {
    q: "Is this just AI-generated quizzes?",
    a: "No. Questions are grounded in your source, mistakes are tracked by concept, and review is scheduled with spaced repetition.",
  },
  {
    q: "Do I need to sign up to try it?",
    a: "No — the demo course is fully playable. Sign up when you want to save progress and get daily review reminders.",
  },
  {
    q: "Who is it for?",
    a: "Engineers prepping system design interviews under a deadline — and anyone who wants to retain technical material, not just watch it.",
  },
];

export const LANDING_WALKTHROUGH_TITLE = "See a full session";
export const LANDING_WALKTHROUGH_BODY =
  "A two-minute walkthrough video is coming soon — the interactive demo shows the real thing in the meantime.";

export type LandingFooterLink = { label: string; href: string };

export const LANDING_FOOTER_LINKS: LandingFooterLink[] = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "mailto:hello@curriq.app" },
];

// --- Product preview copy (a CSS-only mock of the in-app loop, not a screenshot) ---
export const PREVIEW_COURSE_TITLE = "Distributed Systems Crash Course";
export const PREVIEW_CHAPTER_DONE = "Consensus and replication";
export const PREVIEW_CHAPTER_CURRENT = "Partitioning and sharding";
export const PREVIEW_QUESTION =
  "A service shards by user ID and one shard is overloaded. What's the most likely cause?";
export const PREVIEW_TAKEAWAY =
  "Hot keys overwhelm a single shard even when the cluster has room overall.";
export const PREVIEW_REVIEW_NOTE = "3 concepts ready for review";
export const PREVIEW_CTA_CAPTION = "This demo is real — click to try it";
