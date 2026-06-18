// Writes eval reports to backend/eval-reports/<kind>-<timestamp>.json and
// provides small formatting helpers for console summaries.

import * as fs from 'fs';
import * as path from 'path';

// backend/src/evals -> backend/eval-reports
export const REPORTS_DIR = path.join(__dirname, '..', '..', 'eval-reports');

/** Filesystem-safe ISO timestamp: YYYY-MM-DDTHH-mm-ss */
function timestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
}

export function writeReport(kind: string, data: unknown): string {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `${kind}-${timestamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/** "6/8 = 75.0%" */
export function ratio(n: number, d: number): string {
  if (d === 0) return `${n}/0 = n/a`;
  return `${n}/${d} = ${((n / d) * 100).toFixed(1)}%`;
}

export function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
