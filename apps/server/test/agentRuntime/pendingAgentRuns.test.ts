import assert from "node:assert/strict";
import test from "node:test";
import {
  canApplyRunResponse,
  completePendingRun,
  createPendingRun,
  startPendingRun,
  type PendingAgentRuns,
} from "../../../web/src/pages/agent/hooks/pendingAgentRuns.js";

for (const order of [["a", "b"], ["b", "a"]]) {
  test(`deferred pending runs remain isolated when ${order.join(" then ")} completes`, async () => {
    let runs: PendingAgentRuns = {};
    runs = createPendingRun(runs, { clientRunId: "a", tempMessageId: "temp-a", submittedSessionId: "s1", waitingSince: 1 });
    runs = createPendingRun(runs, { clientRunId: "b", tempMessageId: "temp-b", submittedSessionId: "s2", waitingSince: 2 });
    runs = startPendingRun(runs, "a", "run-a", "s1");
    runs = startPendingRun(runs, "b", "run-b", "s2");

    const deferred = { a: Promise.withResolvers<void>(), b: Promise.withResolvers<void>() };
    const completions = Object.entries(deferred).map(async ([clientRunId, gate]) => {
      await gate.promise;
      runs = completePendingRun(runs, clientRunId);
    });
    deferred[order[0] as "a" | "b"].resolve();
    await deferred[order[0] as "a" | "b"].promise;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(Object.keys(runs).length, 1);
    assert.equal(runs[order[1]!]?.tempMessageId, `temp-${order[1]}`);
    deferred[order[1] as "a" | "b"].resolve();
    await Promise.all(completions);
    assert.deepEqual(runs, {});
  });
}

test("a response only belongs to its submitted or resolved session", async () => {
  let runs: PendingAgentRuns = {};
  runs = createPendingRun(runs, { clientRunId: "a", tempMessageId: "temp-a", submittedSessionId: "", waitingSince: 1 });
  runs = startPendingRun(runs, "a", "run-a", "created-session");
  assert.equal(runs.a?.resolvedSessionId, "created-session");
  assert.equal(runs.a?.submittedSessionId, "");
  assert.equal(canApplyRunResponse(runs.a!, "created-session", "created-session"), true);
  assert.equal(canApplyRunResponse(runs.a!, "user-switched-session", "created-session"), false);
});
