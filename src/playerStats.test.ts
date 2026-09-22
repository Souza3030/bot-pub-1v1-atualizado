import assert from "node:assert/strict";
import test from "node:test";
import { applyOutcome, emptyPlayer } from "./playerStats";

test("shares points while keeping mode records separate", () => {
  const after1v1 = applyOutcome(emptyPlayer("player"), true, "1v1", 25, -15);
  const after4v4 = applyOutcome(after1v1, false, "4v4", 25, -15);
  assert.equal(after4v4.points, 1_010);
  assert.deepEqual(after4v4.modes["1v1"], { wins: 1, losses: 0, matches: 1 });
  assert.deepEqual(after4v4.modes["4v4"], { wins: 0, losses: 1, matches: 1 });
  assert.deepEqual({ wins: after4v4.wins, losses: after4v4.losses, matches: after4v4.matches }, {
    wins: 1, losses: 1, matches: 2,
  });
});
