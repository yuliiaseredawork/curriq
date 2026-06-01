import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const QuestionSchema = z.object({
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

const QuizSchema = z.object({
  chapter_id: z.string(),
  chapter_title: z.string(),
  questions: z.array(QuestionSchema).min(3).max(8),
});

export type Quiz = z.infer<typeof QuizSchema>;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM = `
You are an expert educational assessment designer.

Return ONLY valid JSON.
Do not use markdown.
Do not include explanations outside JSON.

Every question must be grounded in the provided chunks.
Every question must include:
- source_chunk_id
- source_quote copied from the chunk text
`;

function buildPrompt(input: {
  chapterId: string;
  chapterTitle: string;
  chapterSummary: string;
  learningObjectives: string[];
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
Generate a quiz for this course chapter.
Mix multiple-choice and short-answer questions.
</task>

<chapter>
id: ${input.chapterId}
title: ${input.chapterTitle}
summary: ${input.chapterSummary}
learning_objectives:
${input.learningObjectives.map((o) => `- ${o}`).join('\n')}
</chapter>

<rules>
- Generate 3-8 questions.
- Include at least 1 multiple-choice question.
- Include at least 1 short-answer question.
- Every question must be answerable from the provided chunks.
- source_quote must be an exact substring or very close quote from a chunk.
- Do not invent facts not present in the chunks.
</rules>

<output_schema>
{
  "chapter_id": "string",
  "chapter_title": "string",
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

<chunks>
${chunksText}
</chunks>
`;
}

export async function generateQuiz(input: {
  chapterId: string;
  chapterTitle: string;
  chapterSummary: string;
  learningObjectives: string[];
  chunks: Array<{
    id: string | number;
    video_id: string;
    text: string;
  }>;
}): Promise<Quiz> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
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
      return QuizSchema.parse(
        JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
      );
    } catch {
      // retry
    }
  }

  throw new Error('Failed to generate valid quiz');
}