// Shared types for the offline/internal eval tooling.
// These describe eval *inputs* (dataset items) and eval *outputs* (results).

/** A chunk as returned by SearchChunksFn / stored in public.chunks. */
export type EvalChunk = {
  id: string | number;
  course_id?: string;
  video_id?: string;
  start_sec?: number;
  text: string;
  distance?: number;
};

// ---------------------------------------------------------------------------
// Retrieval eval
// ---------------------------------------------------------------------------

export type RetrievalEvalItem = {
  id: string;
  /** Optional in the dataset file; resolved from EVAL_COURSE_ID / --courseId. */
  courseId?: string;
  query: string;
  expectedAnswer?: string;
  expectedConcepts?: string[];
  goldSourceQuote?: string;
  goldChunkId?: string;
};

export type RetrievalEvalResult = {
  itemId: string;
  courseId: string;
  query: string;
  topK: number;
  retrievedChunkIds: string[];
  hitByChunkId?: boolean;
  hitBySourceQuote?: boolean;
  judgeContainsAnswer: boolean;
  judgeExplanation: string;
};

// ---------------------------------------------------------------------------
// Grounding eval
// ---------------------------------------------------------------------------

export type GroundingEvalItem = {
  id: string;
  courseId: string;
  outputType: 'outline' | 'quiz' | 'practice' | 'feedback';
  generatedText: string;
  sourceChunks: Array<{
    chunkId: string;
    text: string;
  }>;
};

export type GroundingEvalResult = {
  itemId: string;
  supported: boolean;
  unsupportedClaims: string[];
  /** 1.0 = fully supported, 0.5 = partial, 0.0 = mostly unsupported/hallucinated. */
  groundingScore: number;
  explanation: string;
};

// ---------------------------------------------------------------------------
// Quiz quality eval
// ---------------------------------------------------------------------------

export type QuizQualityEvalResult = {
  courseId: string;
  chapterId: string;
  questionId: string;
  /** 1-5: does it test understanding/application, not just recall? */
  examOrientedScore: number;
  /** 1-5: are distractors plausible misconceptions? 0 = N/A (short-answer). */
  misconceptionDistractorScore: number;
  /** 1-5: can the correct answer be supported by source chunks? */
  sourceGroundedScore: number;
  issues: string[];
};
