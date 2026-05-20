import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const QuizQuestionSchema = z.object({
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

export const QuizSchema = z.object({
  chapter_id: z.string(),

  questions: z
    .array(QuizQuestionSchema)
    .min(5)
    .max(10),
});

export type Quiz = z.infer<typeof QuizSchema>;

const SYSTEM = `
You are an educational assessment generator.

Return ONLY valid JSON.

Every question MUST:
- be answerable from the provided chunks
- include source_chunk_id
- include source_quote copied from the source chunk
- avoid hallucinations
`;

type Chunk = {
  id: string;
  text: string;
};

export async function generateQuiz(
  chapterTitle: string,
  chunks: Chunk[],
): Promise<Quiz> {
  const chunkText = chunks
    .map(
      (c) => `
[CHUNK ${c.id}]
${c.text}
`,
    )
    .join('\n');

  const prompt = `
<task>
Generate a quiz for this chapter.
Mix MCQ and short-answer questions.
</task>

<chapter>
${chapterTitle}
</chapter>

<rules>
- Generate 5-10 questions
- Include easy/medium/hard questions
- Every question MUST cite a chunk
- source_quote must be copied from the chunk
</rules>

<chunks>
${chunkText}
</chunks>

<output_schema>
{
  "chapter_id": "string",
  "questions": [
    {
      "id": "string",
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
`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',

      max_tokens: 4096,

      temperature: 0.3,

      system: SYSTEM,

      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
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

    try {
      return QuizSchema.parse(
        JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
      );
    } catch {
      // retry
    }
  }

  throw new Error('Quiz generation failed');
}