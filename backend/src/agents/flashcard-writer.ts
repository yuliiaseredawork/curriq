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

const SYSTEM = `
You are an expert tutor writing active-recall flashcards.

Return ONLY valid JSON. No markdown, no text outside JSON.

Every card must be grounded in the provided chunks and include sourceChunkIds.
Prefer cards that target the learner's observed mistakes. Do NOT make trivial
cards from obvious words. Keep "front" concise; keep "back" concise but complete.
`;

function buildPrompt(input: {
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
<card_types>
Use a MIX of these types where the material supports them:
- definition: front "What does X mean?" / back concise answer
- cloze: front a sentence with {{blank}} / back the missing words
- scenario: front a "what happens if…" situation / back the explanation
- misconception: front a true/false or common wrong belief / back the correction
- comparison: front "A vs B: when prefer each?" / back the explanation
</card_types>

<rules>
- 3-5 cards. Ground every card in the chunks; set sourceChunkIds (chunk ids used).
- Prefer cards addressing the observed mistakes.
- Front concise; back concise but complete. Active recall, not trivia.
- For misconception cards set misconceptionTarget (the confusion corrected).
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

export async function generateFlashcards(input: {
  concept: string;
  chunks: Array<{ id: string | number; video_id?: string; text: string }>;
  mistakes?: string[];
  count?: number;
}): Promise<GeneratedCard[]> {
  const count = input.count ?? 4;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      temperature: 0.3,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt({ ...input, count }) }],
    });
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) continue;
    try {
      return CardsSchema.parse(JSON.parse(text.slice(start, end + 1))).cards;
    } catch {
      // retry
    }
  }
  throw new Error('Failed to generate valid flashcards');
}
