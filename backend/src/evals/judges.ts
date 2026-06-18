// LLM judges for the eval suite. Uses the same Anthropic client style as
// backend/src/agents/* (messages.create -> extract JSON -> validate with zod).
// Judges run at temperature 0 for repeatability.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { requireEnv } from './env';
import type { EvalChunk } from './types';

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  return (_client ??= new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') }));
}

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL ?? 'claude-sonnet-4-6';

/** Call the judge model and validate its JSON output against a schema. */
async function callJudge<T>(
  system: string,
  prompt: string,
  schema: z.ZodSchema<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await anthropic().messages.create({
      model: JUDGE_MODEL,
      max_tokens: 1500,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) continue;

    try {
      return schema.parse(JSON.parse(text.slice(start, end + 1)));
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Judge did not return valid JSON after 3 attempts: ${String(lastError)}`,
  );
}

function renderChunks(chunks: EvalChunk[]): string {
  if (!chunks.length) return '(no chunks retrieved)';
  return chunks
    .map(
      (c) => `<chunk id="${c.id}"${c.video_id ? ` video_id="${c.video_id}"` : ''}>
${c.text}
</chunk>`,
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// 1. Retrieval judge
// ---------------------------------------------------------------------------

const RetrievalJudgeSchema = z.object({
  containsAnswer: z.boolean(),
  explanation: z.string(),
});

const RETRIEVAL_SYSTEM = `You are evaluating retrieval quality for a learning platform.
Answer ONLY with valid JSON, no markdown, no extra text.

Rules:
- containsAnswer=true ONLY if the retrieved chunks contain enough information to actually answer the query.
- Do NOT give credit for vague topical similarity.
- If an expected answer is provided, the retrieved chunks must support that specific answer.
- If the chunks are relevant but missing the key fact, return false.`;

export async function retrievalJudge(input: {
  query: string;
  expectedAnswer?: string;
  chunks: EvalChunk[];
}): Promise<z.infer<typeof RetrievalJudgeSchema>> {
  const prompt = `<query>
${input.query}
</query>

${input.expectedAnswer ? `<expected_answer>\n${input.expectedAnswer}\n</expected_answer>\n` : ''}
<retrieved_chunks>
${renderChunks(input.chunks)}
</retrieved_chunks>

Return ONLY:
{
  "containsAnswer": boolean,
  "explanation": string
}`;

  return callJudge(RETRIEVAL_SYSTEM, prompt, RetrievalJudgeSchema);
}

// ---------------------------------------------------------------------------
// 2. Grounding judge
// ---------------------------------------------------------------------------

const GroundingJudgeSchema = z.object({
  supported: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  groundingScore: z.number().min(0).max(1),
  explanation: z.string(),
});

const GROUNDING_SYSTEM = `You are evaluating whether generated educational content is grounded in source material.
Answer ONLY with valid JSON, no markdown, no extra text.

You are given generated text and the source chunks it should be based on.
Identify any claims in the generated text that are NOT supported by the source chunks.

Scoring (groundingScore):
- 1.0 = every claim is fully supported by the chunks
- 0.5 = partially supported (some claims supported, some not)
- 0.0 = mostly unsupported / hallucinated

Rules:
- Only count substantive factual claims, not generic phrasing.
- supported=true only when groundingScore >= 0.8 and there are no material unsupported claims.
- List the unsupported claims verbatim (short) in unsupportedClaims.`;

export async function groundingJudge(input: {
  generatedText: string;
  chunks: EvalChunk[];
}): Promise<z.infer<typeof GroundingJudgeSchema>> {
  const prompt = `<generated_text>
${input.generatedText}
</generated_text>

<source_chunks>
${renderChunks(input.chunks)}
</source_chunks>

Return ONLY:
{
  "supported": boolean,
  "unsupportedClaims": string[],
  "groundingScore": number,
  "explanation": string
}`;

  return callJudge(GROUNDING_SYSTEM, prompt, GroundingJudgeSchema);
}

// ---------------------------------------------------------------------------
// 3. Quiz quality judge
// ---------------------------------------------------------------------------

const QuizJudgeSchema = z.object({
  examOrientedScore: z.number().min(0).max(5),
  misconceptionDistractorScore: z.number().min(0).max(5),
  sourceGroundedScore: z.number().min(0).max(5),
  issues: z.array(z.string()),
});

const QUIZ_SYSTEM = `You are a strict educational assessment reviewer.
Answer ONLY with valid JSON, no markdown, no extra text.

You evaluate a single quiz question against the course source chunks.
Score each dimension from 1 to 5 (5 = excellent).

examOrientedScore:
- High when the question tests understanding, reasoning, or application.
- Low when it is trivial recall or answerable without understanding the material.

misconceptionDistractorScore (multiple-choice only):
- High when wrong choices are plausible and reflect common misconceptions a learner would actually have.
- Low when wrong choices are obviously wrong, off-topic, joke options, or trivially eliminable.
- If the question is short-answer (no choices), set this to 0 and add an issue "N/A: short-answer (no distractors)".

sourceGroundedScore:
- High when the correct answer is clearly supported by the source chunks.
- Low when the answer cannot be verified from the chunks.

List concrete problems in "issues" (empty array if none).`;

export async function quizQuestionJudge(input: {
  question: {
    id: string;
    type?: string;
    question: string;
    choices?: string[];
    answer: string;
    source_quote?: string;
    concept_tags?: string[];
  };
  chunks: EvalChunk[];
}): Promise<z.infer<typeof QuizJudgeSchema>> {
  const q = input.question;
  const prompt = `<question>
type: ${q.type ?? 'unknown'}
question: ${q.question}
${q.choices?.length ? `choices:\n${q.choices.map((ch) => `- ${ch}`).join('\n')}` : 'choices: (none — short answer)'}
correct_answer: ${q.answer}
${q.concept_tags?.length ? `concept_tags: ${q.concept_tags.join(', ')}` : ''}
</question>

<source_chunks>
${renderChunks(input.chunks)}
</source_chunks>

Return ONLY:
{
  "examOrientedScore": number,
  "misconceptionDistractorScore": number,
  "sourceGroundedScore": number,
  "issues": string[]
}`;

  return callJudge(QUIZ_SYSTEM, prompt, QuizJudgeSchema);
}
