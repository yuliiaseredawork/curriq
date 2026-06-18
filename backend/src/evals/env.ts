// Small helpers for eval scripts: env-var access with clear errors, and a
// dependency-free CLI arg parser. Never logs secret values.

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. ` +
        `Eval scripts read config from the environment — see backend/src/evals/README ` +
        `or set it before running (do not paste secrets into the terminal history).`,
    );
  }
  return value;
}

/** Parse `--key value` and `--flag` style args into a record. */
export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/** Resolve the target courseId from --courseId, then EVAL_COURSE_ID, then a fallback. */
export function resolveCourseId(
  args: Record<string, string | boolean>,
  fallback?: string,
): string {
  const fromArg = typeof args.courseId === 'string' ? args.courseId : undefined;
  const courseId = fromArg ?? process.env.EVAL_COURSE_ID ?? fallback;
  if (!courseId) {
    throw new Error(
      'No course id provided. Pass --courseId <id> or set EVAL_COURSE_ID.',
    );
  }
  return courseId;
}
