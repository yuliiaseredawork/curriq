import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const FeedbackSchema = z.object({
  correct: z.boolean(),
  explanation: z.string(),
  ideal_answer: z.string(),
  concept_tags: z.array(z.string()),
});

export type Feedback = z.infer<typeof FeedbackSchema>;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SYSTEM = `
You are an educational tutor.

Return ONLY valid JSON.
Do not use markdown.
Do not include explanations outside JSON.

Evaluate the learner's answer using the provided correct answer and source quote.
Be encouraging, concise, and specific.
`;

export async function evaluateAnswer(input: {
  question: string;
  questionType: 'mcq' | 'short';
  choices?: string[];
  correctAnswer: string;
  userAnswer: string;
  sourceQuote: string;
  conceptTags: string[];
}): Promise<Feedback> {
  const prompt = `
<task>
Evaluate the learner's answer.
</task>

<question>
${input.question}
</question>

<question_type>
${input.questionType}
</question_type>

<choices>
${input.choices?.map((c) => `- ${c}`).join('\n') ?? ''}
</choices>

<correct_answer>
${input.correctAnswer}
</correct_answer>

<learner_answer>
${input.userAnswer}
</learner_answer>

<source_quote>
${input.sourceQuote}
</source_quote>

<concept_tags>
${input.conceptTags.join(', ')}
</concept_tags>

<rules>
- For MCQ, mark correct only if the learner answer matches the correct answer meaningfully.
- For short answers, allow paraphrases if they capture the key meaning.
- Use the source quote to explain why.
- Keep the explanation to ONE or TWO short sentences (it is shown collapsed).
- Write like a coach to the learner. NEVER use internal/retrieval words like
  "chunk", "source chunk", "record", or "the chunk states…". Say "the material
  says…" / "from the lesson…" or just describe the idea directly.
</rules>

<output_schema>
{
  "correct": true,
  "explanation": "string",
  "ideal_answer": "string",
  "concept_tags": ["string"]
}
</output_schema>
`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      temperature: 0.1,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      res.content[0]?.type === 'text'
        ? res.content[0].text
        : '';

    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) continue;

    try {
      return FeedbackSchema.parse(
        JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
      );
    } catch {
      // retry
    }
  }

  throw new Error('Failed to generate valid feedback');
}