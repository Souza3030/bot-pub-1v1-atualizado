import assert from "node:assert/strict";
import test from "node:test";
import { QueueManager } from "./queue";

test("locks a full queue and returns players in arrival order", () => {
  const queue = new QueueManager(4);
  ["a", "b", "c", "d"].forEach((id, index) => queue.join(id, index));
  assert.deepEqual(queue.takeBatch(), ["a", "b", "c", "d"]);
  assert.equal(queue.getState(), "checkin");
  assert.equal(queue.size(), 0);
});

test("rejects duplicates and purges only inactive players", () => {
  const queue = new QueueManager(4);
  assert.equal(queue.join("a", 100).ok, true);
  assert.equal(queue.join("a", 200).reason, "duplicate");
  queue.join("b", 900);
  assert.deepEqual(queue.purgeOlderThan(500, 1_000), ["a"]);
  assert.deepEqual(queue.members(), ["b"]);
});
