import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const OutlineSchema = z.object({
  title: z.string(),
  chapters: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string().min(80),
      learning_objectives: z.array(z.string()).min(2).max(6),
      source_video_ids: z.array(z.string()),
    }),
  ).min(1).max(10),
});

export type Outline = z.infer<typeof OutlineSchema>;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM = `
You are an expert curriculum designer.

Return ONLY valid JSON.
Do not use markdown.
Do not include explanations outside JSON.
Use only the provided course chunks.
`;

function buildPrompt(chunks: Array<{
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
Create a structured course outline from these transcript chunks.
Group related ideas into chapters.
</task>

<requirements>
- Return 3-8 chapters if enough material exists.
- Each chapter must have a clear title.
- Each chapter must have a practical summary.
- Each chapter must include 2-6 measurable learning objectives.
- Each chapter must cite source_video_ids using provided video_id values.
- Do not invent topics not present in the chunks.
</requirements>

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

export async function generateOutlineFromChunks(
  chunks: Array<{
    id: string | number;
    video_id: string;
    text: string;
  }>,
): Promise<Outline> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.2,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: buildPrompt(chunks),
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
      return OutlineSchema.parse(
        JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
      );
    } catch {
      // Retry if model returned invalid shape
    }
  }

  throw new Error('Failed to generate valid outline');
}