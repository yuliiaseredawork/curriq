import 'dotenv/config';
import OpenAI from 'openai';
import { Client } from 'pg';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return res.data[0].embedding;
}

async function main() {
  const query = process.argv.slice(2).join(' ');

  if (!query) {
    throw new Error('Usage: pnpm tsx scripts/search-chunks.ts "your search query"');
  }

  const client = new Client({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  const queryEmbedding = await embed(query);

  await client.connect();

  try {
    const result = await client.query(
      `
      SELECT
        id,
        course_id,
        video_id,
        start_sec,
        left(text, 300) AS preview,
        embedding <=> $1::vector AS distance
      FROM public.chunks
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 5
      `,
      [`[${queryEmbedding.join(',')}]`],
    );

    console.table(result.rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});