// Shared visual language for a premium dark "learning coach" UI.
//
// Pure Tailwind class strings only — no components, no dependencies, no
// behavior. Pages add their own per-call-site padding/spacing; these cover
// background / shape / border / elevation so the app reads as one product
// instead of many flat gray rectangles. Keep important learning text readable;
// only metadata uses the quiet tiers.

// Page shell: a subtle top-down gradient for depth instead of a flat slab.
export const pageShell =
  'min-h-screen bg-gradient-to-b from-gray-950 via-gray-950 to-gray-900 text-white';

// Centered content gutters with consistent vertical rhythm. `pageContainer` for
// dashboards, `readingContainer` for focused reading/learning flows.
export const pageContainer = 'mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-10';
export const readingContainer = 'mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-10';

// Eyebrow + section heading.
export const eyebrow = 'text-xs font-medium uppercase tracking-wide text-gray-500';
export const sectionHeading = 'text-2xl font-semibold tracking-tight';

// Cards — three elevations with soft white-alpha borders for a premium dark
// look (no harsh gray outlines).
const card = 'rounded-2xl border transition';
export const subtleCard = `${card} border-white/5 bg-white/[0.02]`;
export const primaryCard = `${card} border-white/10 bg-gray-900/50 shadow-lg shadow-black/20`;
export const elevatedCard = `${card} border-white/10 bg-gray-900/70 shadow-xl shadow-black/30 ring-1 ring-white/5`;
// Hoverable surface (course rows, anything clickable).
export const interactiveCard = `${primaryCard} hover:border-white/20 hover:bg-gray-900/70`;
// Accent surface for the single most important thing on a screen (today's plan,
// course launch hero).
export const accentCard =
  'rounded-2xl border border-blue-400/25 bg-gradient-to-br from-blue-950/50 via-gray-900/40 to-gray-900/30 shadow-lg shadow-blue-950/30';

// Text tiers (learning content stays readable; meta stays quiet).
export const metaText = 'text-sm text-gray-400';
export const mutedText = 'text-xs text-gray-500';

// Progress bar (track + gradient fill; width set per call site).
export const progressTrack = 'h-2 overflow-hidden rounded-full bg-white/5';
export const progressFill = 'h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400';

// Quiet tertiary action (back links, sign out, refresh).
export const ghostLink = 'text-sm text-gray-400 transition hover:text-white';

// Buttons live in learnerCopy (widely imported + tested); re-export so every CTA
// can pull its visual language from one ui module.
export { primaryButtonClass, secondaryButtonClass } from './learnerCopy';
