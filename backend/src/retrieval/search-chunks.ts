import { createReusableClient } from "../storage/database";

export const handler = async (event: {
  courseId: string;
  embedding: number[];
  limit?: number;
}) => {
  const client = await createReusableClient();

  try {
    const result = await client.query(
      `
      SELECT
        id,
        course_id,
        video_id,
        start_sec,
        text,
        embedding <=> $1::vector AS distance
      FROM public.chunks
      WHERE course_id = $2
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      [`[${event.embedding.join(",")}]`, event.courseId, event.limit ?? 5],
    );

    return {
      results: result.rows,
    };
  } finally {
    await client.end();
  }
};
