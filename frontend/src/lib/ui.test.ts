// Local check:  npx tsx src/lib/ui.test.ts  (from frontend/)
//
// Guards the shared visual-language tokens: every token is a usable class
// string, the premium-dark direction holds (gradient shell, rounded bordered
// cards, gradient progress fill), and the buttons re-export keeps their anchors.
import assert from 'node:assert';
import {
  pageShell,
  pageContainer,
  readingContainer,
  eyebrow,
  sectionHeading,
  subtleCard,
  primaryCard,
  elevatedCard,
  interactiveCard,
  accentCard,
  metaText,
  mutedText,
  progressTrack,
  progressFill,
  ghostLink,
  primaryButtonClass,
  secondaryButtonClass,
} from './ui';

// --- every token is a non-empty class string --------------------------------
const tokens: Record<string, string> = {
  pageShell,
  pageContainer,
  readingContainer,
  eyebrow,
  sectionHeading,
  subtleCard,
  primaryCard,
  elevatedCard,
  interactiveCard,
  accentCard,
  metaText,
  mutedText,
  progressTrack,
  progressFill,
  ghostLink,
};
for (const [name, v] of Object.entries(tokens)) {
  assert.ok(typeof v === 'string' && v.trim().length > 0, `${name} is a non-empty class string`);
}

// --- premium dark direction --------------------------------------------------
assert.ok(/min-h-screen/.test(pageShell), 'page shell fills the viewport');
assert.ok(/bg-gradient/.test(pageShell), 'page shell uses a subtle gradient (not a flat slab)');
// Containers center content with gutters.
for (const c of [pageContainer, readingContainer]) {
  assert.ok(/mx-auto/.test(c) && /max-w-/.test(c), 'containers are centered with a max width');
}
// Cards: rounded + bordered (soft, intentional surfaces — not flat rectangles).
for (const [name, c] of Object.entries({ subtleCard, primaryCard, elevatedCard, interactiveCard, accentCard })) {
  assert.ok(/rounded-/.test(c), `${name} is rounded`);
  assert.ok(/border/.test(c), `${name} has a border`);
}
// Elevation increases from subtle → elevated.
assert.ok(/shadow/.test(elevatedCard), 'elevated card carries a shadow');
// Progress bar: a track + a gradient fill.
assert.ok(/rounded-full/.test(progressTrack), 'progress track is a pill');
assert.ok(/bg-gradient/.test(progressFill), 'progress fill uses a gradient');
// Meta tiers stay quiet (small/secondary), not used for primary learning text.
assert.ok(/text-sm/.test(metaText) && /text-xs/.test(mutedText), 'meta tiers are small');

// --- buttons re-exported from one place, with their anchors intact ----------
assert.ok(/bg-blue-500/.test(primaryButtonClass), 'primary button stays blue');
assert.ok(/disabled:opacity-50/.test(primaryButtonClass), 'primary button preserves disabled state');
assert.ok(!/\bpx-\d/.test(primaryButtonClass), 'primary button leaves padding to call sites');
assert.ok(/border/.test(secondaryButtonClass), 'secondary button is bordered/quiet');

console.log('ui.test.ts OK');
