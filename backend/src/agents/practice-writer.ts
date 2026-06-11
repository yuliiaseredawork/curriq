import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const PracticeQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['mcq', 'short']),
  question: z.string(),
  choices: z.array(z.string()).optional(),
  answer: z.string(),
  source_chunk_id: z.string(),
  source_quote: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  concept_tags: z.array(z.string()).min(1),
});

const PracticeSchema = z.object({
  practice_id: z.string(),
  concept: z.string(),
  title: z.string(),
  questions: z.array(PracticeQuestionSchema).min(3).max(5),
});

export type Practice = z.infer<typeof PracticeSchema>;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM = `
You are an expert tutor creating targeted practice.

Return ONLY valid JSON.
Do not use markdown.
Do not include explanations outside JSON.

Every question must be grounded in the provided chunks.
Every question must include source_chunk_id and source_quote.
`;

function buildPrompt(input: {
  practiceId: string;
  concept: string;
  chunks: Array<{
    id: string | number;
    video_id: string;
    text: string;
  }>;
}) {
  const chunksText = input.chunks
    .map(
      (c) => `
<chunk id="${c.id}" video_id="${c.video_id}">
${c.text}
</chunk>`,
    )
    .join('\n');

  return `
<task>
Generate extra practice questions for the concept: ${input.concept}
</task>

<rules>
- Generate 3-5 questions.
- Mix multiple-choice and short-answer questions.
- Questions should help the learner repair misunderstanding.
- Every question must be answerable from the provided chunks.
- Do not invent facts.
- source_quote must be based on the provided chunks.
</rules>

<output_schema>
{
  "practice_id": "${input.practiceId}",
  "concept": "${input.concept}",
  "title": "Practice: ${input.concept}",
  "questions": [
    {
      "id": "practice-q1",
      "type": "mcq | short",
      "question": "string",
      "choices": ["string"],
      "answer": "string",
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

export async function generatePractice(input: {
  practiceId: string;
  concept: string;
  chunks: Array<{
    id: string | number;
    video_id: string;
    text: string;
  }>;
}): Promise<Practice> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      temperature: 0.2,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: buildPrompt(input),
        },
      ],
    });

    const text =
      res.content[0]?.type === 'text'
        ? res.content[0].text
        : '';

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) continue;

    try {
      return PracticeSchema.parse(
        JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
      );
    } catch {
      // retry
    }
  }

  throw new Error('Failed to generate valid practice');
}