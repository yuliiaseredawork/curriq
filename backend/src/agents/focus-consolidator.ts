import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Groups a learner's many raw mistake concepts into a few meaningful,
// human-readable focus areas (learning objectives), grounded only in the
// provided concepts. Titles must read like objectives, not keywords.
const FocusAreaSchema = z.object({
  title: z.string().min(8),
  shortDescription: z.string().min(10),
  whyItMatters: z.string(),
  rawConcepts: z.array(z.string()).min(1),
  recommendedQuestionTypes: z.array(z.string()).default([]),
});

const ConsolidationSchema = z.object({
  focusAreas: z.array(FocusAreaSchema).min(1).max(6),
});

export type ConsolidatedFocusArea = z.infer<typeof FocusAreaSchema>;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM = `
You consolidate a learner's scattered mistake concepts into a few meaningful
remediation focus areas.

Return ONLY valid JSON. No markdown, no text outside JSON.

Rules:
- Group semantically related concepts into the SAME focus area.
- Produce 2-5 focus areas total (fewer is better). Never one-per-concept.
- "title" must read like a learning objective in plain language, NOT a keyword.
  Good: "Kafka partitioning, ordering, and scaling trade-offs"
  Bad: "partitions", "scaling", "trade-offs"
- "shortDescription": one sentence naming the actual gap, e.g.
  "You missed how partitions affect ordering, parallelism, and throughput."
- "rawConcepts": the subset of the PROVIDED concepts merged into this area
  (use the exact provided strings). Every provided concept should appear in
  exactly one focus area.
- Only use the provided concepts; do not invent new topics.
`;

export async function consolidateFocusAreas(input: {
  concepts: Array<{ tag: string; count: number }>;
  sampleGaps?: string[]; // optional mistake explanations for grounding
}): Promise<ConsolidatedFocusArea[]> {
  const conceptList = input.concepts
    .map((c) => `- ${c.tag} (missed ${c.count}x)`)
    .join('\n');
  const gaps = (input.sampleGaps ?? []).slice(0, 8).map((g) => `- ${g}`).join('\n');

  const prompt = `
<concepts>
${conceptList}
</concepts>

${gaps ? `<observed_gaps>\n${gaps}\n</observed_gaps>\n` : ''}
Consolidate these into 2-5 focus areas.

Return ONLY:
{
  "focusAreas": [
    {
      "title": "string (learning objective)",
      "shortDescription": "string (one sentence)",
      "whyItMatters": "string",
      "rawConcepts": ["exact concept from the list"],
      "recommendedQuestionTypes": ["conceptual" | "application" | "comparison"]
    }
  ]
}
`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.2,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) continue;
    try {
      return ConsolidationSchema.parse(JSON.parse(text.slice(start, end + 1))).focusAreas;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Focus consolidation failed: ${String(lastError)}`);
}
