import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Rubric grading for open-ended remediation answers. Returns a structured
// breakdown (not just an ideal answer) so the UI can show what the learner got
// right, what they missed, and why.
const RubricSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  strengths: z.array(z.string()),
  missingConcepts: z.array(z.string()),
  misconceptions: z.array(z.string()),
  feedback: z.string(),
});

export type RubricResult = z.infer<typeof RubricSchema>;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM = `
You are a strict but encouraging tutor grading a learner's open-ended answer
against the ideal answer and source material.

Return ONLY valid JSON. No markdown, no text outside JSON.

Grade on understanding, not wording. Award partial credit.
- score: 0-100 (how well the answer demonstrates understanding)
- passed: true if score >= 70
- strengths: specific correct points the learner made
- missingConcepts: key ideas from the ideal answer they omitted
- misconceptions: anything incorrect or confused they stated
- feedback: 1-3 sentences, specific and constructive
If the answer is empty or off-topic, score it low and explain why.
`;

export async function gradeWithRubric(input: {
  question: string;
  idealAnswer: string;
  sourceQuote?: string;
  conceptTags?: string[];
  userAnswer: string;
}): Promise<RubricResult> {
  const prompt = `
<question>
${input.question}
</question>

<ideal_answer>
${input.idealAnswer}
</ideal_answer>

${input.sourceQuote ? `<source>\n${input.sourceQuote}\n</source>\n` : ''}
<learner_answer>
${input.userAnswer}
</learner_answer>

Return ONLY:
{
  "score": number,
  "passed": boolean,
  "strengths": string[],
  "missingConcepts": string[],
  "misconceptions": string[],
  "feedback": string
}
`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) continue;

    try {
      return RubricSchema.parse(JSON.parse(text.slice(start, end + 1)));
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Rubric grader failed: ${String(lastError)}`);
}
