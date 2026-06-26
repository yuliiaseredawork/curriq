import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Shape is unchanged from the original (title, chapters[{id, title, summary,
// learning_objectives, source_video_ids}]). Bounds are tightened conservatively
// so output renders cleanly in the UI — these affect NEW generations only;
// already-saved outlines are never re-validated on load.
export const OutlineSchema = z.object({
  title: z.string().min(1),
  chapters: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        summary: z.string().min(60).max(400),
        learning_objectives: z.array(z.string().trim().min(8).max(120)).min(2).max(5),
        source_video_ids: z.array(z.string()),
      }),
    )
    .min(1)
    .max(8),
});

export type Outline = z.infer<typeof OutlineSchema>;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM = `
You design focused, source-specific learning paths — not generic course skeletons.
Every chapter title, summary, and objective must be traceable to the provided
material and use its own terminology. A learner should immediately see that this
course is about THIS source, not a generic topic.

Return ONLY valid JSON.
Do not use markdown.
Do not include explanations outside JSON.
Use only the provided course chunks.
`;

export function buildPrompt(chunks: Array<{
  id: string | number;
  video_id: string;
  text: string;
}>) {
  const context = chunks
    .map((c) => {
      return `
<chunk id="${c.id}" video_id="${c.video_id}">
${c.text}
</chunk>`;
    })
    .join('\n');

  return `
<task>
Design a learning path from the source chunks below: a sequence of chapters that
takes a learner from foundations to applying the material. This is the path the
learner will follow, so it must be specific to this source and well ordered.
</task>

<content_type_adaptation>
First infer what this material is from the chunks, then shape the chapters to fit
(do NOT name the inferred type anywhere in the output):
- interview prep / Q&A -> chapters are competencies a candidate must demonstrate.
- technical / API documentation -> chapters are tasks and capabilities to build or configure.
- textbook / theory -> chapters follow a concept progression.
- tutorial / lecture / walkthrough -> chapters are skills the learner can reproduce.
- if unsure, default to a concept progression.
</content_type_adaptation>

<structure>
- Prefer 4-6 substantial chapters. Never more than 8. Merge thin topics; each
  chapter is a coherent learning unit worth real study time, not a single fact.
- Order chapters by prerequisite progression: foundations first, each later
  chapter building on earlier ones, ending in application / synthesis. A later
  chapter may assume earlier ones.
</structure>

<titles>
- Specific to the source: name the actual concept, technique, or topic taught.
- BAN generic titles: Introduction, Overview, Basics, Getting Started,
  Fundamentals, Advanced Topics, Miscellaneous, Conclusion (and close variants).
- BAN generic title TEMPLATES — these are not specific enough either:
  "Introduction to X", "Overview of X", "Basics of X", "Fundamentals of X",
  "Getting Started with X". Replace them with a source-specific concept title
  (e.g. "Introduction to CAP Theorem" -> "The CAP Theorem Trade-off").
- The course "title" must be specific and source-grounded, not "Course on X".
- Good: "Consumer Groups and Partition Rebalancing". Bad: "Introduction to Kafka".
</titles>

<summaries>
- 1-2 sentences describing what the learner will be able to DO after the chapter
  and why it matters.
- Do NOT begin with "This chapter introduces/covers/explains/discusses" (or
  similar meta-description). Describe the outcome, not the chapter.
</summaries>

<learning_objectives>
- 2-5 per chapter. Concise (<= ~12 words), observable, and testable.
- Start each with an observable verb: explain, compare, apply, evaluate, debug,
  configure, implement, derive, identify, distinguish (or similar).
- BAN vague objectives: "Understand the basics of...", "Know about...",
  "Learn what X is...". An objective must name something specific and checkable.
- Good: "Configure a consumer group to balance partitions across instances".
  Bad: "Understand the basics of consumers".
</learning_objectives>

<grounding>
- Every title, summary, and objective must be supported by the chunks. Use the
  source's own terminology. Do not invent topics, examples, or scope not present.
- Each chapter cites source_video_ids using the provided video_id values.
</grounding>

<output_schema>
{
  "title": "string",
  "chapters": [
    {
      "id": "chapter-1",
      "title": "string",
      "summary": "string",
      "learning_objectives": ["string"],
      "source_video_ids": ["string"]
    }
  ]
}
</output_schema>

<chunks>
${context}
</chunks>
`;
}

// Generic titles the prompt bans; detected here as a soft signal too.
const GENERIC_TITLES = new Set([
  'introduction',
  'intro',
  'overview',
  'basics',
  'getting started',
  'fundamentals',
  'advanced topics',
  'miscellaneous',
  'conclusion',
  'summary',
]);

// Generic *prefix* templates like "Introduction to X" / "Basics of Y" /
// "Getting Started with Z". Word-boundary anchored + a connector word so
// specific titles ("Introducing Backpressure in Streams") are NOT matched.
const GENERIC_TITLE_PREFIX_RE =
  /^\s*(introduction|intro|overview|basics|fundamentals)\b\s+(to|of|for)\b|^\s*getting started\b\s+with\b/i;

function isGenericTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return GENERIC_TITLES.has(t) || GENERIC_TITLE_PREFIX_RE.test(title.trim());
}

// Summaries that meta-describe the chapter instead of the learner outcome.
const SUMMARY_META_RE =
  /^\s*this chapter\s+(introduces|covers|explains|discusses|describes|presents|examines)\b/i;

// Objectives that are vague rather than observable/testable.
const VAGUE_OBJECTIVE_RE = /^\s*(understand|know|learn)\b/i;

/**
 * Soft quality detector for a parsed outline. Returns human-readable issue
 * strings (generic titles, meta summaries, vague objectives). SOFT only — the
 * caller logs these; it never throws, fails the course, or regenerates.
 */
export function outlineQualityIssues(outline: Outline): string[] {
  const issues: string[] = [];
  for (const ch of outline.chapters) {
    if (isGenericTitle(ch.title)) {
      issues.push(`generic chapter title: "${ch.title}"`);
    }
    if (SUMMARY_META_RE.test(ch.summary)) {
      issues.push(`meta summary (avoid "This chapter…"): "${ch.title}"`);
    }
    for (const obj of ch.learning_objectives) {
      if (VAGUE_OBJECTIVE_RE.test(obj)) {
        issues.push(`vague objective: "${obj}"`);
      }
    }
  }
  return issues;
}

/**
 * Corrective feedback appended to a single retry when a valid-shape outline has
 * soft quality issues. Pure — lists the concrete issues plus fix guidance.
 */
export function correctiveFeedback(issues: string[]): string {
  return [
    'Your previous outline had quality problems. Fix them and regenerate:',
    ...issues.map((i) => `- ${i}`),
    '',
    "Replace generic chapter titles like 'Introduction to X', 'Overview of X', or",
    "'Basics of X' with source-specific concept titles that name the actual topic.",
    'Rewrite meta summaries (e.g. "This chapter covers…") as learner outcomes.',
    'Make every objective observable, testable, and grounded in the chunks.',
  ].join('\n');
}

export async function generateOutlineFromChunks(
  chunks: Array<{
    id: string | number;
    video_id: string;
    text: string;
  }>,
): Promise<Outline> {
  // Soft quality issues trigger at most ONE corrective regeneration; parse/
  // schema failures keep their own retries. We never fail a course over style.
  let correctiveNote: string | null = null;
  let corrected = false;
  let best: Outline | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const userContent = correctiveNote
      ? `${buildPrompt(chunks)}\n\n<corrections>\n${correctiveNote}\n</corrections>`
      : buildPrompt(chunks);

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.2,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });

    const text =
      res.content[0]?.type === 'text'
        ? res.content[0].text
        : '';

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      continue;
    }

    let outline: Outline;
    try {
      outline = OutlineSchema.parse(JSON.parse(text.slice(jsonStart, jsonEnd + 1)));
    } catch {
      // Retry if model returned invalid shape (parse/schema retry, unchanged).
      continue;
    }

    const issues = outlineQualityIssues(outline);

    // First time we see soft issues: regenerate ONCE with corrective feedback.
    if (issues.length && !corrected) {
      console.warn('[outliner] soft quality issues — one corrective retry', {
        count: issues.length,
        issues,
      });
      best = outline; // fallback if the corrective attempt is worse/unparseable
      correctiveNote = correctiveFeedback(issues);
      corrected = true;
      continue;
    }

    if (issues.length) {
      console.warn('[outliner] soft quality issues remain after corrective retry (accepting)', {
        count: issues.length,
        issues,
      });
    }
    return outline;
  }

  // Corrective retry happened but later attempts failed to parse — accept the
  // earlier valid outline rather than failing the course over style.
  if (best) return best;

  throw new Error('Failed to generate valid outline');
}