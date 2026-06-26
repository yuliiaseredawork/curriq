import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// NOTE on backwards compatibility:
// The study flow (backend/src/api/routes/study.ts) and the frontend chapter
// page read these existing fields and MUST keep working:
//   id, type, question, choices (mcq), answer, source_chunk_id,
//   source_quote, difficulty, concept_tags
// New fields below are ADDITIVE and optional-at-the-consumer:
//   question_kind        - drives the question-mix self-check
//   explanation          - source-grounded rationale for the answer
//   misconception_target - what learner confusion an MCQ's distractors target
const QuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['mcq', 'short']),
  // Pedagogical category, used to enforce the question mix.
  question_kind: z.enum(['recall', 'conceptual', 'application', 'comparison']),
  question: z.string(),
  // Models emit null for short-answer questions; normalize null -> undefined
  // so the saved artifact omits the field (matching the original behavior).
  choices: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? undefined),
  answer: z.string(),
  // What common misconception the distractors are designed to catch (MCQ only).
  misconception_target: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  // Short, source-grounded explanation of why the answer is correct.
  explanation: z.string(),
  source_chunk_id: z.string(),
  source_quote: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  concept_tags: z.array(z.string()).min(1),
});

type Question = z.infer<typeof QuestionSchema>;

const QuizSchema = z.object({
  chapter_id: z.string(),
  chapter_title: z.string(),
  questions: z.array(QuestionSchema).min(5).max(8),
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

Your job is to write questions that test whether a learner UNDERSTANDS the
material, not whether they can recall a single sentence from the transcript.

Every question must be grounded in the provided chunks. Every question must include:
- source_chunk_id (the chunk that supports the answer)
- source_quote copied from that chunk's text
- explanation: a short, source-grounded reason the answer is correct
Do NOT create a question if the chunks do not support both its answer and its explanation.
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
Generate a quiz for this course chapter that tests genuine understanding.
</task>

<chapter>
id: ${input.chapterId}
title: ${input.chapterTitle}
summary: ${input.chapterSummary}
learning_objectives:
${input.learningObjectives.map((o) => `- ${o}`).join('\n')}
</chapter>

<question_count>
Generate 6-7 questions.
</question_count>

<question_mix>
Classify each question with "question_kind". Target this distribution:
- recall: at most 20% (for 6-7 questions, AT MOST 1 recall question)
- conceptual: ~40% (AT LEAST 2 "why/how" understanding questions)
- application: ~30% (AT LEAST 2 scenario / "what would happen if..." questions)
- comparison: ~10% (at least 1 compare/contrast or synthesis question when the material supports it)
</question_mix>

<first_question>
The FIRST question sets the learning impression — make it strong.
- The first question MUST be conceptual, scenario-based, trade-off-based, or
  misconception-based. Do NOT make it a pure definition/recall question (e.g.
  "what does X mean?") unless the source material is purely definitional.
- For interview-prep, system-design, or technical content, open with a
  trade-off, misconception, or application question.
- Definitions belong inside explanations or in a later easy question — never as
  the very first question.
</first_question>

<question_style>
STRONGLY PREFER questions that test:
- conceptual understanding ("which statement best explains why...")
- application to a scenario ("a user does X — what happens next and why?")
- cause and effect ("what is the consequence of...")
- comparison ("why is X safer/different from Y?")
- "what would happen if..." reasoning

AVOID (these count as low-value recall):
- pure date/number recall
- acronym-expansion ("what does X stand for?")
- naming/branding/history trivia ("what was it formerly called?", "which company...")
- simple "what is X?" definitions
- facts answerable by quoting a single sentence verbatim
- obvious facts copied directly from the transcript
At most ONE question may be simple recall, and only if it has real value.

Be honest with "question_kind": if a question only asks for a name, date,
acronym expansion, or a single stated fact, its kind IS "recall" — do not
label it conceptual/application to dodge the recall cap.
</question_style>

<mcq_rules>
- Every MCQ must have EXACTLY 4 choices: 1 correct + 3 distractors.
- "answer" MUST be the exact text of the correct choice.
- Distractors must be PLAUSIBLE MISCONCEPTIONS, not obviously wrong options:
  * each distractor must relate to the SAME concept as the question
  * each distractor should reflect a confusion a real learner would have
    (e.g. mixing up two related concepts the chunks discuss)
  * distractors must be grounded in / inferable from the source chunks
- Distractors must NOT be:
  * invented/random acronyms, product names, or services not in the chunks
  * absurd or unrelated options (e.g. one platform's mechanism offered as the other's "fallback")
  * options a careful reader can eliminate from a single sentence
  * trivially eliminable filler
- A good distractor requires conceptual understanding to rule out, not just
  attention to one stated fact.
- Set "misconception_target" to a short phrase naming the confusion the
  distractors are designed to catch (e.g. "Confuses concept A with concept B").
</mcq_rules>

<short_answer_rules>
- Short-answer questions must require explanation, reasoning, comparison, or
  describing a mechanism — NOT a one-word definition.
- Good: "Explain why <mechanism> reduces <risk> compared with <alternative>."
- Bad: "What does <term> stand for?"
- "answer" is the ideal answer; "explanation" justifies it from the source.
</short_answer_rules>

<output_schema>
{
  "chapter_id": "string",
  "chapter_title": "string",
  "questions": [
    {
      "id": "string",
      "type": "mcq | short",
      "question_kind": "recall | conceptual | application | comparison",
      "question": "string",
      "choices": ["string", "string", "string", "string"],
      "answer": "string",
      "misconception_target": "string (MCQ only; what confusion the distractors target)",
      "explanation": "string (source-grounded reason the answer is correct)",
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

/**
 * Lightweight structural self-check. Returns the list of problems with a
 * question; an empty array means it passed.
 */
function questionIssues(q: Question): string[] {
  const issues: string[] = [];

  if (q.type === 'mcq') {
    const choices = q.choices ?? [];
    if (choices.length !== 4) {
      issues.push('MCQ must have exactly 4 choices');
    } else {
      const normalized = choices.map((c) => c.trim().toLowerCase());
      if (new Set(normalized).size !== normalized.length) {
        issues.push('MCQ choices are not distinct');
      }
      if (!normalized.includes(q.answer.trim().toLowerCase())) {
        issues.push('MCQ answer is not one of the choices');
      }
    }
  }

  if (!q.concept_tags?.length) {
    issues.push('empty concept_tags');
  }
  if (!q.source_quote?.trim() || !q.source_chunk_id?.trim()) {
    issues.push('missing source grounding');
  }
  if (!q.explanation?.trim()) {
    issues.push('missing explanation');
  }

  return issues;
}

// Trivia / definition patterns that are recall regardless of how the model
// labels them. Definition patterns are kept TIGHT so conceptual "what is the
// consequence when…" questions are not misclassified as recall.
const TRIVIA_PATTERNS = [
  /what does .+ stand for/i,
  /\bin what year\b/i,
  /which year\b/i,
  /formerly (known as|called)/i,
  /(was|is) .+ (called|named) (before|previously)/i,
  // Pure definition shapes.
  /what does .+\bmean\b/i,
  /^\s*define\b/i,
  /what is the definition of\b/i,
  /what is meant by\b/i,
];

export function isRecall(q: Question): boolean {
  return q.question_kind === 'recall' || TRIVIA_PATTERNS.some((p) => p.test(q.question));
}

/**
 * Ensure the first question is a strong learning impression: if it's a
 * recall/definition question and a later non-recall question exists, move the
 * first non-recall question to index 0 (rest stays stable). No-op if all
 * questions are recall or the first is already non-recall. Pure — only reorders.
 */
export function leadWithNonRecall(questions: Question[]): Question[] {
  if (questions.length === 0 || !isRecall(questions[0])) return questions;
  const idx = questions.findIndex((q) => !isRecall(q));
  if (idx <= 0) return questions; // none, or already at front
  const reordered = [...questions];
  const [lead] = reordered.splice(idx, 1);
  reordered.unshift(lead);
  return reordered;
}

/**
 * Quiz-level checks: keep only valid questions and cap trivial recall.
 * Returns the cleaned question set plus any quiz-level problems found.
 */
function reviewQuiz(quiz: Quiz): { cleaned: Question[]; problems: string[] } {
  const problems: string[] = [];

  const valid = quiz.questions.filter((q) => {
    const issues = questionIssues(q);
    if (issues.length) {
      problems.push(`question ${q.id}: ${issues.join('; ')}`);
      return false;
    }
    return true;
  });

  // Cap simple recall at one (drop the extra trivial questions), counting
  // mislabeled trivia (e.g. acronym-expansion, naming history) as recall.
  const recall = valid.filter(isRecall);
  let kept = valid;
  if (recall.length > 1) {
    problems.push(`${recall.length} recall questions (max 1) — trimming extras`);
    const drop = new Set(recall.slice(1).map((q) => q.id));
    kept = valid.filter((q) => !drop.has(q.id));
  }

  // First impression: never open on a definition/recall when a better question
  // exists. Reorder only — the saved schema/shape is unchanged.
  const cleaned = leadWithNonRecall(kept);
  if (cleaned[0] !== kept[0]) {
    problems.push('reordered: leading recall/definition demoted below a conceptual question');
  }

  return { cleaned, problems };
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
      max_tokens: 6000,
      temperature: 0.3,
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

    let quiz: Quiz;
    try {
      quiz = QuizSchema.parse(
        JSON.parse(text.slice(jsonStart, jsonEnd + 1)),
      );
    } catch (e: any) {
      const detail = e?.issues
        ? e.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).slice(0, 6).join(' | ')
        : e?.message;
      console.warn(
        `[quiz-writer] invalid shape (attempt ${attempt + 1}) for ${input.chapterId}: ${detail}`,
      );
      continue; // invalid shape — retry
    }

    const { cleaned, problems } = reviewQuiz(quiz);
    if (problems.length) {
      console.warn(
        `[quiz-writer] self-check (attempt ${attempt + 1}) for ${input.chapterId}:`,
        problems,
      );
    }

    // Retry once if the self-check thinned the quiz below a usable size.
    if (cleaned.length < 4 && attempt < 2) continue;

    if (cleaned.length >= 3) {
      return { ...quiz, questions: cleaned };
    }
  }

  throw new Error('Failed to generate valid quiz');
}
