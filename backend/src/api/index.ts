import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { courses } from './routes/courses';
import { search } from './routes/search';
import { outline } from './routes/outline';
import { quizzes } from './routes/quizzes';
import { study } from './routes/study';
import { cors } from 'hono/cors';
import { courseProcessing } from './routes/course-processing';
import { practice } from './routes/practice';
import { UnauthorizedError } from '../auth/current-user';

const app = new Hono();

// Map auth failures to a clean 401 instead of a generic 500.
app.onError((err, c) => {
  if (err instanceof UnauthorizedError || err.message === 'UNAUTHORIZED') {
    return c.json({ error: 'UNAUTHORIZED' }, 401);
  }
  console.error('[api] unhandled error:', err);
  return c.json({ error: 'INTERNAL_ERROR' }, 500);
});

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/courses', courses);
app.route('/search', search);
app.route('/outline', outline);
app.route('/quizzes', quizzes);
app.route('/study', study);
app.route('/courses', courseProcessing);
app.route('/practice', practice);

export const handler = handle(app);