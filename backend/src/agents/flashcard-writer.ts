import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Generates durable active-recall flashcards for a concept, grounded in the
// course's source chunks and biased toward the learner's mistakes. Same client
// / JSON-extract / zod pattern as remediation-writer.ts.

const CardSchema = z.object({
  type: z.enum(['definition', 'cloze', 'scenario', 'misconception', 'comparison']),
  front: z.string().min(3),
  back: z.string().min(2),
  sourceChunkIds: z.array(z.string()).default([]),
  sourceQuote: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  misconceptionTarget: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

const CardsSchema = z.object({ cards: z.array(CardSchema).min(3).max(5) });

export type GeneratedCard = z.infer<typeof CardSchema>;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const SYSTEM = `
You are an expert tutor writing high-quality active-recall flashcards for
spaced repetition. A great card is ATOMIC (tests one thing), specific, and fast
to answer (10–20 seconds).

Return ONLY valid JSON. No markdown, no text outside JSON.

Every card must be grounded in the provided chunks and include sourceChunkIds.
Prefer cards that target the learner's observed mistakes. Never make trivial
cards from obvious words. The "front" is ONE clear recall target; the "back" is
short and structured, not an essay. Put any verbatim source text in
"sourceQuote", never in the main answer.
`;

export function buildPrompt(input: {
  concept: string;
  chunks: Array<{ id: string | number; video_id?: string; text: string }>;
  mistakes?: string[];
  count: number;
}) {
  const chunksText = input.chunks
    .map((c) => `<chunk id="${c.id}">\n${c.text}\n</chunk>`)
    .join('\n');
  const mistakes = (input.mistakes ?? []).slice(0, 6).map((m) => `- ${m}`).join('\n');

  return `
<task>
Write ${input.count} active-recall flashcards for the concept: ${input.concept}
</task>

${mistakes ? `<observed_mistakes>\n${mistakes}\n</observed_mistakes>\n` : ''}
<atomicity>
- One card tests ONE thing. A learner should answer it in 10–20 seconds.
- Never combine multiple ideas, and never ask more than one question, in a card.
</atomicity>

<front>
- Short (ideally 1–2 sentences), concrete, and answerable from memory — ONE
  question only. Test decision-making, trade-offs, mental models, or common
  mistakes — not rote recall.
- PREFER applied review prompts like:
  * "A candidate says X — what is the flaw?"
  * "You are designing X — what should happen, and why?"
  * "Why does X behave this way?"
  * "When would you choose A over B?"
  * "What mistake should you avoid when …?"
- BAN these weak fronts:
  * "True or False: …" — only allowed if it targets a genuine, named
    misconception AND ruling it out needs real understanding.
  * "According to the video/source material, …" — never reference the source.
  * vague prompts with no recall target: "What is the likely consequence?",
    "Explain this topic.", "What should you know about X?", "Describe X.".
  * generic definitions ("What is X?") unless the term is foundational AND the
    answer is not obvious.
  * anything answerable by common sense alone, without the source material.
</front>

<back>
- Concise and STRUCTURED. Use short labeled lines, each on its own line:
    Answer: one concise sentence — the recall target.
    Why it matters: one short sentence of reasoning (optional).
    Watch out: the common trap or misconception (optional).
- No long paragraphs. Do NOT paste source text into the back — use sourceQuote.
- Write for the LEARNER. NEVER use internal words like "chunk"/"source chunk"/
  "the chunk states…" anywhere (back, sourceQuote, misconceptionTarget); say
  "the material says…" or describe the idea directly.
</back>

<card_types>
Use a MIX of these types where the material supports them:
- scenario: front a "you're doing X — what next?" situation / structured back
- misconception: front a common wrong belief / back the correction (+ set misconceptionTarget)
- comparison: front "A vs B: which fits here and why?" / back the trade-off
- cloze: a sentence with {{blank}} in the FRONT only — use SPARINGLY, and only
  when the missing term is genuinely important and non-obvious (never an obvious
  fill-in-the-blank) / back the missing words
- definition: only when a term is foundational AND the answer is not obvious — not trivia
</card_types>

<interview_prep>
- For system design / interview-prep content, cards test DECISION-MAKING,
  trade-offs, mental models, or common mistakes — what a strong candidate gets right.
- For technical docs / tutorials, cards test BEHAVIOR, configuration consequences,
  debugging, or implementation choices.
- Avoid trivial definition/acronym cards and anything answerable by common sense.
</interview_prep>

<examples>
GOOD front: "You're 10 minutes into a 45-minute system design interview and
still refining requirements. What should you do next?"
GOOD back:
"Answer: Move on to the design — cap requirements at about five minutes.
Why it matters: It leaves time for architecture, scaling, and trade-offs.
Watch out: Being thorough on requirements is not the same as showing design depth."

GOOD front: "A candidate adds a cache in front of the database but keeps writing
only to the DB. What breaks?"  (applied — tests a real mistake)

BAD front: "True or False: caching can improve read performance."  (trivially true)
BAD front: "According to the source material, what is a consumer group?"  (references the source; rote)
BAD front: "What is the likely consequence?"  (vague — no clear recall target)
BAD back: one long paragraph restating a transcript sentence with a quote pasted in.
</examples>

<rules>
- ${input.count} cards. Ground every card in the chunks; set sourceChunkIds.
- Prefer cards addressing the observed mistakes.
- Keep each card atomic: front is one clear question; back is short and structured.
- For misconception cards set misconceptionTarget (the confusion corrected).
- Put any verbatim source snippet in sourceQuote, never in the back.
</rules>

<output_schema>
{
  "cards": [
    {
      "type": "definition | cloze | scenario | misconception | comparison",
      "front": "string",
      "back": "string",
      "sourceChunkIds": ["string"],
      "sourceQuote": "string (optional, from a chunk)",
      "misconceptionTarget": "string (misconception cards only)",
      "difficulty": "easy | medium | hard"
    }
  ]
}
</output_schema>

<chunks>
${chunksText}
</chunks>
`;
}

// --- Soft quality bar (style only — never fails generation) ------------------
// Pure detectors mirroring the outliner's approach: surface low-quality cards so
// the generator can self-correct ONCE, but never throw or fail a course over
// style. A card is judged on its own fields.

// Vague fronts with no clear recall target (the symptom this task fixes).
const VAGUE_FRONT_RE: RegExp[] = [
  /what is the likely consequence/i,
  /^\s*explain\b/i,
  /^\s*describe\b/i,
  /^\s*discuss\b/i,
  /what should you know about\b/i,
  /^\s*what is the (impact|result|effect)\b.{0,40}\??\s*$/i,
];

const FRONT_MAX = 200; // chars — a front is a quick prompt, not a paragraph
const BACK_MAX = 320; // chars — a back is concise, not an essay
const BLANK_RE = /\{\{\s*[^{}]*\}\}/;

/**
 * Soft quality issues for one generated card. Empty array = passes. Detects
 * vague fronts, overlong front/back, multiple questions in one front, a source
 * quote that dominates the answer, and leaked cloze placeholders.
 */
export function flashcardQualityIssues(card: {
  type: string;
  front: string;
  back: string;
  sourceQuote?: string;
}): string[] {
  const issues: string[] = [];
  const front = (card.front ?? '').trim();
  const back = (card.back ?? '').trim();

  if (VAGUE_FRONT_RE.some((re) => re.test(front))) issues.push(`vague front: "${front}"`);
  if (front.length > FRONT_MAX) issues.push(`front too long (${front.length} chars)`);
  if (back.length > BACK_MAX) issues.push(`back too long (${back.length} chars)`);
  // More than one "?" in the front signals two questions crammed into one card.
  if ((front.match(/\?/g) ?? []).length > 1) issues.push('front asks more than one question');

  // Weak/simplistic shapes that read like school trivia rather than applied review.
  if (/^\s*true or false\b/i.test(front)) issues.push(`"True or False" front: "${front}"`);
  if (/^\s*according to\b/i.test(front)) issues.push(`"According to…" front references the source: "${front}"`);
  // Generic definition-only card: a short "what is/are X?" with no applied angle
  // (the "?" count guard above already excludes multi-part prompts).
  if (card.type === 'definition' && /^\s*what (is|are)\b/i.test(front) && front.length <= 80) {
    issues.push(`generic definition-only front: "${front}"`);
  }
  // Obvious fill-in-the-blank: a cloze whose answer is a single trivial token.
  if (card.type === 'cloze' && BLANK_RE.test(front)) {
    const ans = back.replace(/^answer:\s*/i, '').trim();
    if (ans && ans.split(/\s+/).length <= 1 && ans.length <= 3) {
      issues.push(`obvious fill-in-the-blank (answer "${ans}")`);
    }
  }

  // A source quote belongs in sourceQuote; if it's pasted in and dominates the
  // back, the "answer" is really just a transcript snippet.
  const quote = (card.sourceQuote ?? '').trim();
  if (quote && back.includes(quote) && quote.length >= back.length * 0.5) {
    issues.push('source quote dominates the answer');
  }

  // Cloze blanks belong only in a cloze FRONT — never in the back, never in a
  // non-cloze front.
  if (BLANK_RE.test(back)) issues.push('raw {{blank}} placeholder leaked into the back');
  if (card.type !== 'cloze' && BLANK_RE.test(front)) {
    issues.push('unexpected {{blank}} in a non-cloze front');
  }

  return issues;
}

/** Corrective note appended to a single retry when cards have soft issues. */
export function flashcardCorrectiveFeedback(issues: string[]): string {
  return [
    'Your previous flashcards had quality problems. Fix them and regenerate:',
    ...issues.map((i) => `- ${i}`),
    '',
    'Make every front an APPLIED prompt that tests decision-making, trade-offs,',
    'or a common mistake — not "True or False", not "According to the source",',
    'not a generic definition, and not something answerable by common sense.',
    'Keep each back concise and structured (Answer / Why it matters / Watch out),',
    'not a paragraph. Put any verbatim source text in sourceQuote, and use',
    '{{blank}} only when the missing term is genuinely important and non-obvious.',
  ].join('\n');
}

export async function generateFlashcards(input: {
  concept: string;
  chunks: Array<{ id: string | number; video_id?: string; text: string }>;
  mistakes?: string[];
  count?: number;
}): Promise<GeneratedCard[]> {
  const count = input.count ?? 4;
  // Soft quality issues trigger at most ONE corrective regeneration; parse/
  // schema failures keep their own retries. We never fail over style.
  let correctiveNote: string | null = null;
  let corrected = false;
  let best: GeneratedCard[] | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const userContent = correctiveNote
      ? `${buildPrompt({ ...input, count })}\n\n<corrections>\n${correctiveNote}\n</corrections>`
      : buildPrompt({ ...input, count });

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      temperature: 0.3,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) continue;

    let cards: GeneratedCard[];
    try {
      cards = CardsSchema.parse(JSON.parse(text.slice(start, end + 1))).cards;
    } catch {
      continue; // invalid shape — parse/schema retry (unchanged)
    }

    const issues = cards.flatMap((c, i) =>
      flashcardQualityIssues(c).map((x) => `card ${i + 1}: ${x}`),
    );

    // First time we see soft issues: regenerate ONCE with corrective feedback.
    if (issues.length && !corrected) {
      console.warn('[flashcard-writer] soft quality issues — one corrective retry', {
        count: issues.length,
        issues,
      });
      best = cards; // fallback if the corrective attempt is worse/unparseable
      correctiveNote = flashcardCorrectiveFeedback(issues);
      corrected = true;
      continue;
    }

    if (issues.length) {
      console.warn('[flashcard-writer] soft quality issues remain after corrective retry (accepting)', {
        count: issues.length,
        issues,
      });
    }
    return cards;
  }

  // Corrective retry happened but later attempts failed to parse — accept the
  // earlier valid cards rather than failing over style.
  if (best) return best;

  throw new Error('Failed to generate valid flashcards');
}
