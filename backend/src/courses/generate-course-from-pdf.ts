// Background course generation from an uploaded PDF.
//
// Mirrors generate-course.ts (YouTube) but the source is a PDF in the raw
// bucket. Reuses the existing pipeline as much as possible:
//   - embedding (OpenAI) runs here (no VPC needed)
//   - DB insert into pgvector is delegated to ProcessTranscriptFn (in-VPC),
//     by writing the same chunks.json shape it already consumes
//   - outline via the existing outliner; quizzes via the existing fan-out
//
// PDF chunks are stored in public.chunks with video_id = 'pdf' (a synthetic
// source id — the chunks table is shared across source types). Rich per-chunk
// metadata (page ranges, fileName) is kept in a separate S3 artifact for
// future citations.

import {
  LambdaClient,
  InvokeCommand,
  InvocationType,
} from '@aws-sdk/client-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';

import { saveOutline } from '../storage/course-artifacts';
import { generateOutlineFromChunks } from '../agents/outliner';
import { callCourseMetadata } from './course-metadata-client';
import { toUserSafeReason } from './failure-reason';

// pdf-parse has no types for the /lib subpath; bundled by esbuild for Lambda.
// Using the lib entry avoids the package's debug-mode test-file read.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  data: Buffer,
  opts?: any,
) => Promise<any>;

const s3 = new S3Client({});
const lambda = new LambdaClient({});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Synthetic source id for PDF chunks in the shared public.chunks table.
const PDF_SOURCE_ID = 'pdf';
const MAX_CHUNK_CHARS = 1600;

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

async function invokeJson(functionName: string, payload: unknown) {
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
  const parsed = text ? JSON.parse(text) : null;
  if (res.FunctionError) {
    throw new Error(`${functionName} failed: ${res.FunctionError} ${text}`);
  }
  return parsed;
}

async function searchChunks(input: {
  courseId: string;
  query: string;
  limit: number;
}) {
  const embedding = await embed(input.query);
  return invokeJson(process.env.SEARCH_CHUNKS_FUNCTION_NAME!, {
    courseId: input.courseId,
    embedding,
    limit: input.limit,
  });
}

async function fanOutChapterQuizzes(
  courseId: string,
  chapters: Array<{ id: string }>,
) {
  const fnName = process.env.GENERATE_CHAPTER_QUIZ_FUNCTION_NAME;
  if (!fnName) {
    console.warn('[generate-course-from-pdf] GENERATE_CHAPTER_QUIZ_FUNCTION_NAME not set; skipping fan-out', { courseId });
    return;
  }
  for (const chapter of chapters) {
    try {
      await lambda.send(
        new InvokeCommand({
          FunctionName: fnName,
          InvocationType: InvocationType.Event,
          Payload: Buffer.from(JSON.stringify({ courseId, chapterId: chapter.id })),
        }),
      );
      console.log('[generate-course-from-pdf] quiz generation queued', { courseId, chapterId: chapter.id });
    } catch (e: any) {
      console.error('[generate-course-from-pdf] failed to queue chapter quiz', {
        courseId,
        chapterId: chapter.id,
        error: String(e?.message ?? e),
      });
    }
  }
}

/** Extract text per page using pdf-parse's pagerender hook. */
async function extractPages(buffer: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const tc = await pageData.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      const text = tc.items
        .map((i: any) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push(text);
      return text;
    },
  });
  return pages;
}

type PdfChunk = {
  text: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
};

/** Page-aware chunking: skips empty pages, keeps page ranges, bounds size. */
function chunkPages(pages: string[]): PdfChunk[] {
  const units: { text: string; page: number }[] = [];
  pages.forEach((raw, idx) => {
    const page = idx + 1;
    const text = (raw || '').replace(/\s+/g, ' ').trim();
    if (!text) return; // skip empty / image-only pages
    if (text.length <= MAX_CHUNK_CHARS) {
      units.push({ text, page });
    } else {
      for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) {
        units.push({ text: text.slice(i, i + MAX_CHUNK_CHARS), page });
      }
    }
  });

  const chunks: PdfChunk[] = [];
  let acc = '';
  let pageStart = 0;
  let pageEnd = 0;
  let chunkIndex = 0;

  for (const u of units) {
    if (!acc) {
      acc = u.text;
      pageStart = u.page;
      pageEnd = u.page;
    } else if (acc.length + 1 + u.text.length > MAX_CHUNK_CHARS) {
      chunks.push({ text: acc, pageStart, pageEnd, chunkIndex: chunkIndex++ });
      acc = u.text;
      pageStart = u.page;
      pageEnd = u.page;
    } else {
      acc = `${acc} ${u.text}`;
      pageEnd = u.page;
    }
  }
  if (acc) chunks.push({ text: acc, pageStart, pageEnd, chunkIndex: chunkIndex++ });
  return chunks;
}

export const handler = async (event: {
  courseId: string;
  userId: string;
  fileKey: string;
  fileName: string;
}) => {
  const { courseId, userId, fileKey, fileName } = event;
  console.log('[generate-course-from-pdf] start', { courseId, userId, fileName });

  try {
    await callCourseMetadata({ action: 'updateStatus', courseId, status: 'INGESTING' });

    // 1. Read PDF from the raw bucket.
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: process.env.RAW_BUCKET!, Key: fileKey }),
    );
    const buffer = Buffer.from(await obj.Body!.transformToByteArray());

    // 2. Extract text per page.
    const pages = await extractPages(buffer);
    const pdfChunks = chunkPages(pages);
    console.log('[generate-course-from-pdf] extracted', {
      courseId,
      pageCount: pages.length,
      chunkCount: pdfChunks.length,
    });

    if (!pdfChunks.length) {
      throw new Error(
        'This PDF appears to contain no extractable text. OCR is not supported yet.',
      );
    }

    await callCourseMetadata({ action: 'updateStatus', courseId, status: 'PROCESSING' });

    // 3. Embed chunks (OpenAI).
    const embedded = [];
    for (const ch of pdfChunks) {
      const embedding = await embed(ch.text);
      embedded.push({ ...ch, embedding });
    }

    // 4a. Write chunks in the shape ProcessTranscriptFn consumes (start = page).
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.PROCESSED_BUCKET!,
        Key: `courses/${courseId}/videos/${PDF_SOURCE_ID}/chunks.json`,
        Body: JSON.stringify({
          courseId,
          videoId: PDF_SOURCE_ID,
          chunks: embedded.map((c) => ({
            text: c.text,
            start: c.pageStart,
            embedding: c.embedding,
          })),
        }),
        ContentType: 'application/json',
      }),
    );

    // 4b. Write rich PDF chunk metadata for future citations.
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.PROCESSED_BUCKET!,
        Key: `courses/${courseId}/pdf/chunks.json`,
        Body: JSON.stringify({
          courseId,
          sourceType: 'PDF',
          fileName,
          chunks: pdfChunks.map((c) => ({
            chunkIndex: c.chunkIndex,
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
            text: c.text,
          })),
        }),
        ContentType: 'application/json',
      }),
    );

    // 5. Insert into pgvector via the in-VPC ProcessTranscriptFn.
    await invokeJson(process.env.PROCESS_TRANSCRIPT_FUNCTION_NAME!, {
      courseId,
      playlistId: PDF_SOURCE_ID,
      videoId: PDF_SOURCE_ID,
    });

    // 6. Outline from retrieved chunks (reuses the existing outliner).
    await callCourseMetadata({ action: 'updateStatus', courseId, status: 'OUTLINING' });
    const search = await searchChunks({
      courseId,
      query: 'main topics and concepts in this document',
      limit: 6,
    });
    if (!search.results?.length) {
      throw new Error('No embedded chunks found after processing.');
    }
    const outline = await generateOutlineFromChunks(search.results);
    await saveOutline(courseId, outline);
    console.log('[generate-course-from-pdf] outline generated', {
      courseId,
      title: outline.title,
      chapters: outline.chapters.length,
    });

    // 7. Mark READY (preserve PDF source metadata).
    await callCourseMetadata({
      action: 'upsert',
      courseId,
      userId,
      title: outline.title,
      status: 'READY',
      sourceType: 'PDF',
      sourceFileKey: fileKey,
      sourceFileName: fileName,
    });
    console.log('[generate-course-from-pdf] status → READY', { courseId });

    // 8. Background quiz generation per chapter.
    await fanOutChapterQuizzes(courseId, outline.chapters);

    return { courseId, status: 'READY', title: outline.title };
  } catch (e: any) {
    const rawError = String(e?.message ?? e);
    const errorMessage = toUserSafeReason(e);
    console.error('[generate-course-from-pdf] FAILED', { courseId, error: rawError });
    try {
      await callCourseMetadata({
        action: 'updateStatus',
        courseId,
        status: 'FAILED',
        errorMessage,
      });
    } catch (metaErr: any) {
      console.error('[generate-course-from-pdf] could not update FAILED status', {
        courseId,
        metaError: String(metaErr?.message ?? metaErr),
      });
    }
    throw e;
  }
};
