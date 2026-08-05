import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

async function collectTests(directory) {
  const tests = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) tests.push(...await collectTests(path));
    else if (/\.test\.tsx?$/.test(entry.name)) tests.push(path);
  }
  return tests;
}

const tests = (await collectTests(resolve(process.cwd(), process.argv[2] ?? 'src'))).sort();
if (!tests.length) {
  console.error('No test files found.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...tests],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
