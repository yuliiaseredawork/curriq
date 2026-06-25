import { redirect } from 'next/navigation';
import { sessionHref } from '@/lib/sessionScope';

// The standalone "Study Chapter" flow has been consolidated into the one
// canonical session. This route now redirects (chapter scope folds into the
// course-scoped session) so old deep links keep working — no 404, no second
// MCQ renderer.
export default async function ChapterRedirect({
  params,
}: {
  params: Promise<{ courseId: string; chapterId: string }>;
}) {
  const { courseId } = await params;
  redirect(sessionHref(courseId));
}
