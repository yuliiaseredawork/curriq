# Quiz quality: eval findings & prompt changes

Tracks the quiz-generation quality work driven by the `eval:quiz` results.
Eval target course: **"How Apple Pay and Google Pay Work"**
(`EVAL_COURSE_ID=545c81b8-2914-44b5-b311-bbebe84a97a7`).

## What the eval found (baseline)

The first `eval:quiz` run (chapter-1, 7 questions) scored:

| Metric | Score |
|---|---|
| examOrientedScore | 3.57 / 5 |
| misconceptionDistractorScore | 3.25 / 5 |
| sourceGroundedScore | 4.71 / 5 |

Concrete problems the judge flagged:
- **Trivial recall** — q1 was a date-recall ("when did Apple Pay launch?"), q2 a
  definition ("what does TSP stand for?").
- **Weak/fabricated distractors** — q4 used invented acronyms (e.g. "Device PAN
  Relay (DPR)", "NFC Secure Mode") and trivially eliminable options.

## What changed

All changes are in `backend/src/agents/quiz-writer.ts` and are **additive** —
the study flow and frontend still read the existing fields
(`id, type, question, choices, answer, source_chunk_id, source_quote,
difficulty, concept_tags`).

1. **Prompt — pedagogy.** Strongly prefer conceptual / application / cause-effect
   / comparison / "what would happen if…" questions. Explicit AVOID list for
   date/acronym/naming/definition trivia.
2. **Prompt — question mix.** Target ≤20% recall, ~40% conceptual, ~30%
   application, ~10% comparison; tag each question with a new `question_kind`.
3. **Prompt — distractors.** MCQs must have exactly 4 choices; distractors must
   be plausible misconceptions grounded in the chunks (no invented
   acronyms/product names, no absurd/eliminable filler), and require conceptual
   understanding to rule out. New optional `misconception_target` field names the
   confusion each MCQ targets.
4. **Prompt — grounding.** Every question must carry `source_chunk_id`,
   `source_quote`, and a new `explanation`; do not write a question the chunks
   can't support.
5. **Prompt — short answer.** Must test reasoning/mechanism/comparison, not
   one-word definitions.
6. **Schema.** Added `question_kind` (required), `explanation` (required),
   `misconception_target` (optional). `choices`/`misconception_target` accept
   model-emitted `null` and normalize to `undefined` (kept short-answer
   artifacts clean).
7. **Self-check (`reviewQuiz`).** After generation: drop questions failing
   structural checks (4 distinct MCQ choices, answer ∈ choices, non-empty
   concept_tags, present source grounding + explanation), and **cap recall at 1**
   — counting mislabeled trivia (acronym-expansion / "formerly called" / year
   questions) as recall via regex so it can't dodge the cap. Regenerates once if
   the quiz is thinned below a usable size.

## Results

Two iterations. Fair comparison = same chapter-1 before vs after:

| Metric | Baseline (ch1) | After (ch1) | All 4 chapters | Target |
|---|---|---|---|---|
| examOrientedScore | 3.57 | **4.29** | 4.39 | ≥ 4.0 ✓ |
| misconceptionDistractorScore | 3.25 | **4.17** | 3.67 | ≥ 4.0 (ch1 ✓) |
| sourceGroundedScore | 4.71 | **4.86** | 4.71 | ≥ 4.5 ✓ |

- On chapter-1 (apples-to-apples) **all three targets are met**, distractor
  quality included.
- Across all 4 chapters, exam-oriented and grounding hit target; the distractor
  average (3.67) is held down by chapters 2–4, whose source chunks are thinner
  and repetitive — the judge flags remaining distractors as "plausible but
  slightly eliminable" or "not explicitly in source". This is a **source-quality
  ceiling**, not a prompt problem; richer ingested transcripts (more chunks per
  chapter) are the lever to push it further.

## How to rerun

From repo root, with eval env exported (see `project-eval-framework` memory):

```bash
set -a && source infra/.env && set +a
export AWS_PROFILE=curriq AWS_REGION=us-west-2
export SEARCH_CHUNKS_FUNCTION_NAME="Curriq-Ingest-dev-SearchChunksFn6E9C906F-ASQtqHeA4Ca7"
export PROCESSED_BUCKET="curriq-data-dev-processed10bec1ce-wgzj0s2niztf"
export EVAL_COURSE_ID="545c81b8-2914-44b5-b311-bbebe84a97a7"

# regenerate all chapters (or one: --chapterId chapter-2)
pnpm tsx backend/src/evals/regenerate-quizzes.ts

# re-evaluate
pnpm eval:quiz

# inspect latest report
ls -t backend/eval-reports/quiz-quality-*.json | head -1
```
