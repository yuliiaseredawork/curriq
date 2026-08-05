// Demo content for the public, no-signup experience (/demo).
//
// Everything here is ORIGINAL content written for Curriq (questions, answers,
// objectives, flashcards) about standard system-design fundamentals — nothing
// is scraped or transcribed from anyone's videos. The catalog below references
// well-known free creators by name/link (metadata only) as examples of the
// kind of source material Curriq turns into practice.

export type DemoMcq = {
  id: string;
  question: string;
  choices: string[];
  answer: string;
  explanation: string;
  /** The named confusion a wrong answer usually signals — powers the
   *  "here's what you mixed up" line in the demo summary. */
  mixUp: string;
};

export type DemoFlashcard = {
  front: string;
  back: string;
  concept: string;
};

export type DemoChapter = { title: string; objectives: string[] };

export const DEMO_COURSE = {
  title: "Message Queues & Kafka: Interview Fundamentals",
  source: "Built from free system-design content",
  estimatedMinutes: 4,
  chapters: [
    {
      title: "Why queues exist: decoupling and backpressure",
      objectives: [
        "Explain when a message queue actually helps a design — and when it’s overkill",
        "Use backpressure to protect downstream services during traffic spikes",
      ],
    },
    {
      title: "Kafka’s model: logs, partitions, and consumer groups",
      objectives: [
        "Reason about ordering guarantees per partition",
        "Choose partition keys that avoid hot partitions",
      ],
    },
  ] satisfies DemoChapter[],
  questions: [
    {
      id: "demo-q1",
      question:
        "Your checkout service calls an email service synchronously, and email outages now fail checkouts. You add a queue between them. What’s the main property you’ve gained?",
      choices: [
        "Emails are now guaranteed to be delivered exactly once",
        "Checkout no longer depends on the email service being up at request time",
        "The email service processes each message faster than before",
        "Checkout latency increases, which makes the system more reliable",
      ],
      answer:
        "Checkout no longer depends on the email service being up at request time",
      explanation:
        "The queue decouples availability: checkout only needs the broker to accept the message. Delivery guarantees and consumer speed don’t change just because a queue exists.",
      mixUp: "conflating decoupling with delivery guarantees",
    },
    {
      id: "demo-q2",
      question:
        "You partition a Kafka topic by user ID and one partition runs far hotter than the rest. What’s the most likely cause?",
      choices: [
        "Consumers are committing offsets too frequently on that partition",
        "The broker assigned that partition less disk space than the others",
        "A few high-activity users hash to the same partition",
        "The replication factor is too low for that partition",
      ],
      answer: "A few high-activity users hash to the same partition",
      explanation:
        "Partitioning by key concentrates all of a hot key’s traffic on one partition — and the cluster can’t split a single key across partitions to rebalance it.",
      mixUp: "confusing partition skew with broker configuration",
    },
    {
      id: "demo-q3",
      question:
        "A teammate says: “Kafka persists messages to disk, so our system is reliable now.” What’s the flaw in that reasoning?",
      choices: [
        "Kafka only persists messages when replication is turned off entirely",
        "Broker durability isn’t end-to-end delivery — a consumer can still crash after reading",
        "Disk persistence makes Kafka slower than in-memory queues in every case",
        "Reliability requires exactly-once semantics, which no queue offers at all",
      ],
      answer:
        "Broker durability isn’t end-to-end delivery — a consumer can still crash after reading",
      explanation:
        "Durability on the broker is one link in the chain. End-to-end reliability also needs consumer-side handling: retries, idempotent processing, and careful offset commits.",
      mixUp: "conflating persistence with reliability",
    },
  ] satisfies DemoMcq[],
  flashcard: {
    concept: "Offset commits and delivery semantics",
    front:
      "You’re consuming from Kafka and processing has a side effect (charging a card). When should you commit the offset?",
    back: [
      "Answer: After the side effect completes — commit-after-processing gives at-least-once delivery.",
      "Why it matters: Committing before processing means a crash silently loses the message (at-most-once).",
      "Watch out: At-least-once means duplicates are possible — the charge must be idempotent.",
    ].join("\n"),
  } satisfies DemoFlashcard,
};

// What a demo rating WOULD schedule (illustrative day-one SM-2-style intervals;
// real scheduling happens only for signed-in users).
export const DEMO_RATING_INTERVALS: Record<string, number> = {
  AGAIN: 0,
  HARD: 1,
  GOOD: 3,
  EASY: 7,
};

// --- Prebuilt interview-prep catalog (metadata + attribution links only) ------

export type CatalogCourse = {
  title: string;
  creator: string;
  creatorUrl: string;
  focus: string;
  objectives: string[];
};

export const PREBUILT_CATALOG_LABEL = "Popular interview-prep sources";
export const PREBUILT_CATALOG_HINT =
  "Paste any of these — or your own video, playlist, or PDF — and Curriq builds the practice for you.";

export const PREBUILT_CATALOG: CatalogCourse[] = [
  {
    title: "System Design Interview Basics",
    creator: "ByteByteGo",
    creatorUrl: "https://www.youtube.com/@ByteByteGo",
    focus: "Scaling, caching, load balancing",
    objectives: [
      "Walk a 45-minute design interview with a repeatable structure",
      "Pick between horizontal and vertical scaling with real trade-offs",
    ],
  },
  {
    title: "Backend Engineering Fundamentals",
    creator: "Hussein Nasser",
    creatorUrl: "https://www.youtube.com/@hnasser",
    focus: "Databases, connections, protocols",
    objectives: [
      "Explain what actually happens on a database connection under load",
      "Choose between long polling, SSE, and WebSockets for a use case",
    ],
  },
  {
    title: "Distributed Systems Deep Dives",
    creator: "Jordan has no life",
    creatorUrl: "https://www.youtube.com/@jordanhasnolife5163",
    focus: "Consensus, replication, partitioning",
    objectives: [
      "Reason about leader election and split-brain scenarios",
      "Compare quorum reads/writes against leader-based replication",
    ],
  },
  {
    title: "Kafka Fundamentals",
    creator: "Free Kafka talks & docs",
    creatorUrl: "https://kafka.apache.org/documentation/",
    focus: "Logs, partitions, consumer groups",
    objectives: [
      "Choose partition keys that keep ordering where it matters",
      "Decide when at-least-once is enough and when you need more",
    ],
  },
  {
    title: "RabbitMQ vs Kafka",
    creator: "Free messaging comparisons",
    creatorUrl: "https://www.rabbitmq.com/docs",
    focus: "Queues vs logs, routing, retention",
    objectives: [
      "Pick the right broker for task queues vs event streams",
      "Explain routing keys vs partition keys without hand-waving",
    ],
  },
  {
    title: "Caching & Consistent Hashing",
    creator: "Free system-design lectures",
    creatorUrl:
      "https://www.youtube.com/results?search_query=consistent+hashing",
    focus: "Cache strategies, invalidation, sharding",
    objectives: [
      "Choose between cache-aside, write-through, and write-behind",
      "Explain why consistent hashing minimizes resharding pain",
    ],
  },
];
