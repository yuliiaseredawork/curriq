"use client";

// Public, no-signup demo (/demo): a playable slice of the real product — three
// applied MCQs with coach-style feedback, one spaced-repetition flashcard with
// the real reveal-then-rate flow, and a mistake-based summary that shows the
// core differentiator (Curriq names WHAT you mixed up and schedules it).
// Everything runs client-side on original demo content (see lib/demoCourses.ts);
// nothing is persisted, and signup is only asked for to save the schedule.

import Link from "next/link";
import { useState } from "react";
import { McqChoices } from "@/components/McqChoices";
import { RatingButtons } from "@/components/RatingButtons";
import { FlashcardBack } from "@/components/FlashcardBack";
import {
  feedbackStatusLabel,
  correctAnswerLabel,
  feedbackTakeaway,
  feedbackDetail,
  flashcardRatedLine,
  FLASHCARD_RATING_PROMPT,
  FLASHCARD_REVIEW_EYEBROW,
  CHAPTER_OUTCOMES_INTRO,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/learnerCopy";
import {
  DEMO_COURSE,
  DEMO_RATING_INTERVALS,
  PREBUILT_CATALOG,
  PREBUILT_CATALOG_LABEL,
  PREBUILT_CATALOG_HINT,
} from "@/lib/demoCourses";
import { track } from "@/lib/analytics";
import {
  pageShell,
  readingContainer,
  elevatedCard,
  primaryCard,
  subtleCard,
  eyebrow,
  ghostLink,
  progressTrack,
  progressFill,
} from "@/lib/ui";

const TOTAL_STEPS = DEMO_COURSE.questions.length + 1; // MCQs + one flashcard

export default function DemoPage() {
  // 'overview' → question steps (0..n-1 MCQs, n = flashcard) → 'summary'
  const [phase, setPhase] = useState<"overview" | number | "summary">(
    "overview",
  );
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [mixUps, setMixUps] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [rating, setRating] = useState<string | null>(null);

  const stepIndex = typeof phase === "number" ? phase : 0;
  const isFlashcardStep =
    typeof phase === "number" && phase === DEMO_COURSE.questions.length;
  const mcq =
    typeof phase === "number" && !isFlashcardStep
      ? DEMO_COURSE.questions[phase]
      : null;

  function startPractice() {
    track("demo_started");
    setPhase(0);
  }

  function submitMcq() {
    if (!mcq || !answer) return;
    setSubmitted(true);
    if (answer === mcq.answer) {
      setCorrectCount((n) => n + 1);
    } else {
      setMixUps((m) => [...m, mcq.mixUp]);
    }
  }

  function nextStep() {
    setAnswer("");
    setSubmitted(false);
    setRevealed(false);
    setRating(null);
    const next = stepIndex + 1;
    if (next >= TOTAL_STEPS) {
      track("demo_completed", { correctCount, missed: mixUps.length });
      setPhase("summary");
    } else {
      setPhase(next);
    }
  }

  function restart() {
    setPhase("overview");
    setAnswer("");
    setSubmitted(false);
    setCorrectCount(0);
    setMixUps([]);
    setRevealed(false);
    setRating(null);
  }

  return (
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <nav className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight"
            aria-label="Curriq"
          >
            Curri<span className="text-blue-400">q</span>
          </Link>
          <Link href="/sign-in" className={ghostLink}>
            Sign in
          </Link>
        </nav>

        {phase === "overview" && (
          <>
            <div className="space-y-2">
              <div className={`${eyebrow} text-blue-300/90`}>
                Demo course · no signup needed
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                {DEMO_COURSE.title}
              </h1>
              <p className="text-sm text-gray-400">
                ~{DEMO_COURSE.estimatedMinutes} min ·{" "}
                {DEMO_COURSE.questions.length} practice questions + 1 review
                card · {DEMO_COURSE.source}
              </p>
            </div>

            <div className="space-y-3">
              {DEMO_COURSE.chapters.map((chapter, i) => (
                <div
                  key={chapter.title}
                  className={`${primaryCard} p-5 space-y-2`}
                >
                  <div className={eyebrow}>Chapter {i + 1}</div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    {chapter.title}
                  </h2>
                  <div className="text-sm text-gray-400">
                    {CHAPTER_OUTCOMES_INTRO}
                  </div>
                  <ul className="list-disc pl-5 text-sm text-gray-300 space-y-0.5">
                    {chapter.objectives.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button
              className={`${primaryButtonClass} px-6 py-3 shadow-md shadow-blue-900/50`}
              onClick={startPractice}
            >
              Start practicing →
            </button>
          </>
        )}

        {typeof phase === "number" && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-300">
                  {stepIndex + 1} of {TOTAL_STEPS}
                </span>
                <span className="truncate text-gray-500">
                  {DEMO_COURSE.title}
                </span>
              </div>
              <div className={progressTrack}>
                <div
                  className={progressFill}
                  style={{
                    width: `${Math.round((stepIndex / TOTAL_STEPS) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {mcq && (
              <>
                <div>
                  <div className={`${eyebrow} text-blue-300`}>Practice</div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    Check your understanding
                  </h1>
                </div>

                <section className={`${elevatedCard} p-6 space-y-5 sm:p-7`}>
                  <h2 className="text-xl font-semibold leading-relaxed">
                    {mcq.question}
                  </h2>

                  <McqChoices
                    choices={mcq.choices}
                    selected={answer}
                    onSelect={setAnswer}
                    disabled={submitted}
                  />

                  {!submitted && (
                    <button
                      className={`${primaryButtonClass} w-full px-6 py-3 sm:w-auto`}
                      onClick={submitMcq}
                      disabled={!answer}
                    >
                      Submit answer
                    </button>
                  )}

                  {submitted &&
                    (() => {
                      const correct = answer === mcq.answer;
                      const detail = feedbackDetail(mcq.explanation);
                      return (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2.5">
                          <span
                            className={`font-medium ${correct ? "text-green-400" : "text-yellow-300"}`}
                          >
                            {feedbackStatusLabel(correct)}
                          </span>

                          {!correct && (
                            <p className="text-sm">
                              <span className="text-gray-500">
                                Correct answer:
                              </span>{" "}
                              <span className="font-medium text-gray-100">
                                {correctAnswerLabel(mcq.answer, mcq.choices)}
                              </span>
                            </p>
                          )}

                          <div>
                            <div className={`${eyebrow} text-gray-500`}>
                              {correct ? "Remember this" : "Takeaway"}
                            </div>
                            <p className="text-gray-200">
                              {feedbackTakeaway(mcq.explanation)}
                            </p>
                          </div>

                          {!correct && (
                            <p className="text-xs text-gray-500">
                              Signed in, Curriq logs this as “{mcq.mixUp}” and
                              schedules a targeted review.
                            </p>
                          )}

                          {detail && (
                            <details>
                              <summary className="cursor-pointer text-sm text-gray-500 transition hover:text-gray-300">
                                Show details
                              </summary>
                              <p className="mt-2 max-w-prose text-sm text-gray-300">
                                {detail}
                              </p>
                            </details>
                          )}

                          <button
                            className={`${primaryButtonClass} w-full px-6 py-3 sm:w-auto`}
                            onClick={nextStep}
                          >
                            Next
                          </button>
                        </div>
                      );
                    })()}
                </section>
              </>
            )}

            {isFlashcardStep && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${eyebrow} text-purple-300`}>
                    {FLASHCARD_REVIEW_EYEBROW}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-xs text-gray-400">
                    {DEMO_COURSE.flashcard.concept}
                  </span>
                </div>

                <section
                  className={`${elevatedCard} flex min-h-[200px] flex-col justify-center gap-4 p-6 sm:p-7`}
                >
                  <p className="text-xl font-medium leading-relaxed">
                    {DEMO_COURSE.flashcard.front}
                  </p>
                  {revealed && (
                    <div className="border-t border-white/10 pt-4">
                      <FlashcardBack
                        back={{ back: DEMO_COURSE.flashcard.back }}
                        concept={DEMO_COURSE.flashcard.concept}
                      />
                    </div>
                  )}
                </section>

                {!revealed ? (
                  <button
                    className="w-full rounded-xl bg-white px-5 py-3.5 font-medium text-black transition hover:bg-gray-100"
                    onClick={() => setRevealed(true)}
                  >
                    Show answer
                  </button>
                ) : rating ? (
                  <div className="rounded-2xl border border-green-500/25 bg-green-950/20 p-5 text-center space-y-3">
                    <p className="text-sm text-gray-300">
                      {flashcardRatedLine(
                        rating,
                        DEMO_RATING_INTERVALS[rating] ?? 1,
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      Sign up free to keep this review schedule — Curriq brings
                      the card back right before you’d forget it.
                    </p>
                    <button
                      className={`${primaryButtonClass} w-full px-6 py-3 sm:w-auto`}
                      onClick={nextStep}
                    >
                      Finish demo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-center text-sm font-medium text-gray-300">
                      {FLASHCARD_RATING_PROMPT}
                    </p>
                    <RatingButtons onRate={setRating} />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {phase === "summary" && (
          <>
            <div className="rounded-2xl border border-green-500/30 bg-green-950/25 p-8 text-center space-y-2">
              <div className="text-2xl font-bold tracking-tight">
                Demo complete 🎉
              </div>
              <p className="text-gray-300">
                You got {correctCount} of {DEMO_COURSE.questions.length}{" "}
                practice questions right.
              </p>
            </div>

            {mixUps.length > 0 && (
              <div className={`${primaryCard} p-5 space-y-2`}>
                <div className={`${eyebrow} text-blue-300`}>
                  What Curriq noticed
                </div>
                <ul className="list-disc pl-5 text-sm text-gray-200 space-y-1">
                  {mixUps.map((m) => (
                    <li key={m}>You were {m} — a classic interview trap.</li>
                  ))}
                </ul>
                <p className="text-sm text-gray-400">
                  Signed in, Curriq schedules targeted review of exactly these
                  weak spots — and brings them back before you forget them.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/sign-in"
                className={`${primaryButtonClass} px-6 py-3 shadow-md shadow-blue-900/50`}
              >
                Sign up free — save your review schedule →
              </Link>
              <button className={ghostLink} onClick={restart}>
                Try the demo again
              </button>
            </div>
          </>
        )}

        {/* Prebuilt interview-prep catalog (metadata + attribution only). */}
        <section className="space-y-3 border-t border-white/5 pt-8">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {PREBUILT_CATALOG_LABEL}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {PREBUILT_CATALOG_HINT}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PREBUILT_CATALOG.map((c) => (
              <div key={c.title} className={`${subtleCard} p-4 space-y-1.5`}>
                <h3 className="font-medium text-gray-100">{c.title}</h3>
                <p className="text-xs text-gray-500">
                  {c.focus} ·{" "}
                  <a
                    href={c.creatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 underline decoration-white/20 hover:text-gray-200"
                  >
                    {c.creator}
                  </a>
                </p>
                <ul className="list-disc pl-4 text-xs text-gray-400 space-y-0.5">
                  {c.objectives.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <Link
            href="/sign-in"
            className={`${secondaryButtonClass} px-4 py-2 text-sm`}
          >
            Sign up to build a course from any source
          </Link>
        </section>
      </div>
    </main>
  );
}
