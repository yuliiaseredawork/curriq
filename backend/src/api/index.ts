import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { courses } from './routes/courses';

const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/courses', courses);

export const handler = handle(app);