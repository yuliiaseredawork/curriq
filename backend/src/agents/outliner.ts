import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const OutlineSchema = z.object({
  title: z.string(),
  chapters: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string().min(120),
      learning_objectives: z.array(z.string()).min(3).max(6),
      source_video_ids: z.array(z.string()),
    }),
  ),
});

export type Outline = z.infer<typeof OutlineSchema>;

const SYSTEM =
  'You are a curriculum designer. Return ONLY valid JSON.';

export async function outline(
  transcripts: string,
): Promise<Outline> {
  const prompt = `
<task>
Design a course outline from these transcripts.
Group related videos into 4-10 chapters.
</task>

<rubric>
Each chapter has 3-6 measurable learning objectives.
</rubric>

<output_schema>
{
  "title": "string",
  "chapters": [...]
}
</output_schema>

<transcripts>
${transcripts}
</transcripts>
`;

  for (let i = 0; i < 3; i++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.2,
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
      return OutlineSchema.parse(
        JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
      );
    } catch {}
  }

  throw new Error('Failed to generate outline');
}