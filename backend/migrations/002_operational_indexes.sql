CREATE INDEX IF NOT EXISTS courses_user_created_idx
  ON public.courses (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS courses_stuck_idx
  ON public.courses (updated_at)
  WHERE status IN ('CREATED', 'INGESTING', 'PROCESSING', 'OUTLINING');
