// Local check:  npx tsx src/lib/analytics.test.ts  (from frontend/)
//
// Pure tests for the analytics abstraction: milestone mapping and the
// never-throws guarantee (tracking must not be able to break the product,
// including in non-browser environments like this test).
import assert from "node:assert";
import {
  track,
  sessionMilestoneEvents,
  recordSessionCompleted,
} from "./analytics";

// --- milestone mapping: first/second session are the retention signals -------
assert.deepStrictEqual(sessionMilestoneEvents(1), ["first_session_completed"]);
assert.deepStrictEqual(sessionMilestoneEvents(2), ["second_session_completed"]);
assert.deepStrictEqual(sessionMilestoneEvents(0), [], "no milestone at zero");
assert.deepStrictEqual(
  sessionMilestoneEvents(3),
  [],
  "no milestone after the second",
);
assert.deepStrictEqual(sessionMilestoneEvents(100), []);

// --- never throws, anywhere ---------------------------------------------------
// No window, no localStorage, no endpoint configured — both entry points must
// be safe no-ops.
assert.doesNotThrow(() => track("review_session_started", { scope: "all" }));
assert.doesNotThrow(() => track("demo_completed"));
assert.doesNotThrow(() => recordSessionCompleted({ reviewed: 5 }));

console.log("analytics.test.ts OK");
