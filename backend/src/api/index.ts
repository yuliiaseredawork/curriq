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
import { coursesPdf } from './routes/courses-pdf';
import { focusAreas } from './routes/focus-areas';
import { reviews } from './routes/reviews';
import { flashcards } from './routes/flashcards';
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

// Temporary structured request logging — confirms requests reach Lambda and
// which route matched. Safe to remove once routing/CORS is confirmed stable.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  console.log('[req]', {
    method: c.req.method,
    path: c.req.path,
    route: c.req.routePath,
    status: c.res.status,
    ms: Date.now() - start,
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/courses', courses);
app.route('/courses', coursesPdf);
app.route('/courses', focusAreas);
app.route('/', reviews);
app.route('/', flashcards);
app.route('/search', search);
app.route('/outline', outline);
app.route('/quizzes', quizzes);
app.route('/study', study);
app.route('/courses', courseProcessing);
app.route('/practice', practice);

export const handler = handle(app);