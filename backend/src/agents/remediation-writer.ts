import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Remediation questions for a weak concept. Like practice-writer, but each
// question carries an `explanation` (ideal-answer rationale) used by the rubric
// grader for open-ended answers.
const RemediationQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['mcq', 'short']),
  question: z.string(),
  choices: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? undefined),
  answer: z.string(),
  explanation: z.string(),
  source_chunk_id: z.string(),
  source_quote: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  concept_tags: z.array(z.string()).min(1),
});

const RemediationSchema = z.object({
  concept: z.string(),
  title: z.string(),
  questions: z.array(RemediationQuestionSchema).min(3).max(5),
});

export type RemediationSet = z.infer<typeof RemediationSchema>;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM = `
You are an expert tutor creating targeted remediation for a concept a learner
got wrong.

Return ONLY valid JSON. No markdown, no text outside JSON.

Every question must be grounded in the provided chunks and include
source_chunk_id and source_quote. Each question needs an "explanation": a short,
source-grounded rationale for the correct/ideal answer (used to grade answers).
`;

function buildPrompt(input: {
  concept: string;
  chunks: Array<{ id: string | number; video_id?: string; text: string }>;
}) {
  const chunksText = input.chunks
    .map(
      (c) => `
<chunk id="${c.id}"${c.video_id ? ` video_id="${c.video_id}"` : ''}>
${c.text}
</chunk>`,
    )
    .join('\n');

  return `
<task>
Create 3-5 remediation questions to repair misunderstanding of: ${input.concept}
</task>

<rules>
- Mix multiple-choice and at least one short-answer question.
- MCQs must have exactly 4 choices; "answer" must match one choice exactly.
- Short-answer questions must test explanation/reasoning, not one-word recall.
- Prefer questions that target the likely misconception behind the mistake.
- Every question must be answerable from the chunks; do not invent facts.
- "explanation" must justify the ideal answer from the chunk content.
</rules>

<output_schema>
{
  "concept": "${input.concept}",
  "title": "Review: ${input.concept}",
  "questions": [
    {
      "id": "rem-q1",
      "type": "mcq | short",
      "question": "string",
      "choices": ["string","string","string","string"],
      "answer": "string",
      "explanation": "string",
      "source_chunk_id": "string",
      "source_quote": "string",
      "difficulty": "easy | medium | hard",
      "concept_tags": ["string"]
    }
  ]
}
</output_schema>

<chunks>
${chunksText}
</chunks>
`;
}

export async function generateRemediation(input: {
  concept: string;
  chunks: Array<{ id: string | number; video_id?: string; text: string }>;
}): Promise<RemediationSet> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      temperature: 0.3,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });

    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) continue;

    try {
      return RemediationSchema.parse(JSON.parse(text.slice(start, end + 1)));
    } catch {
      // retry
    }
  }
  throw new Error('Failed to generate valid remediation');
}
