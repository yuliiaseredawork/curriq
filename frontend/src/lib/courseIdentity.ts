// Deterministic course identity from the title — no AI, no config, no storage.
// Gives each course a category + icon + accent so courses stop looking identical.
// First matching keyword group wins; falls back to a neutral default.

export type CourseIdentity = {
  category: string;
  icon: string;
  /** Tailwind classes for an accent (border + text), matching the dark theme. */
  accentClass: string;
};

type Rule = { keywords: string[]; identity: CourseIdentity };

const RULES: Rule[] = [
  {
    keywords: ['messaging', 'kafka', 'queue', 'pub/sub', 'pubsub', 'event stream'],
    identity: { category: 'Messaging Systems', icon: '⚡', accentClass: 'border-amber-700 text-amber-300' },
  },
  {
    keywords: ['distributed', 'hashing', 'sharding', 'shard', 'consensus', 'raft', 'paxos', 'replication'],
    identity: { category: 'Distributed Systems', icon: '🌐', accentClass: 'border-cyan-700 text-cyan-300' },
  },
  {
    keywords: ['ai', 'ml', 'machine learning', 'neural', 'llm', 'deep learning', 'transformer'],
    identity: { category: 'AI', icon: '🤖', accentClass: 'border-fuchsia-700 text-fuchsia-300' },
  },
  {
    keywords: ['data', 'etl', 'warehouse', 'pipeline', 'spark', 'batch', 'ingestion'],
    identity: { category: 'Data Engineering', icon: '📦', accentClass: 'border-orange-700 text-orange-300' },
  },
  {
    keywords: ['database', 'sql', 'index', 'storage', 'postgres', 'nosql', 'query'],
    identity: { category: 'Databases', icon: '🗄', accentClass: 'border-emerald-700 text-emerald-300' },
  },
  {
    keywords: ['kubernetes', 'k8s', 'docker', 'devops', 'infra', 'infrastructure', 'terraform', 'container'],
    identity: { category: 'Infrastructure', icon: '☸', accentClass: 'border-blue-700 text-blue-300' },
  },
  {
    keywords: ['auth', 'security', 'crypto', 'encryption', 'oauth', 'tls', 'authentication'],
    identity: { category: 'Security', icon: '🔐', accentClass: 'border-rose-700 text-rose-300' },
  },
];

const DEFAULT_IDENTITY: CourseIdentity = {
  category: 'General',
  icon: '📘',
  accentClass: 'border-gray-700 text-gray-300',
};

export function courseIdentity(title?: string | null): CourseIdentity {
  const t = (title ?? '').toLowerCase();
  if (!t) return DEFAULT_IDENTITY;
  for (const rule of RULES) {
    if (rule.keywords.some((k) => t.includes(k))) return rule.identity;
  }
  return DEFAULT_IDENTITY;
}
