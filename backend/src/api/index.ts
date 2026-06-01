import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { courses } from './routes/courses';
import { search } from './routes/search';
import { outline } from './routes/outline';
import { quizzes } from './routes/quizzes';
import { study } from './routes/study';
import { cors } from 'hono/cors';
import { courseProcessing } from './routes/course-processing';

const app = new Hono();

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

export const handler = handle(app);