import assert from "node:assert/strict";
import test from "node:test";
import { recordVote, ResultVotes } from "./matchVoting";

test("finalizes only when both teams confirm the same winner", () => {
  const votes: ResultVotes = {};
  assert.equal(recordVote(votes, "BLUE", "blue").status, "waiting");
  assert.deepEqual(recordVote(votes, "RED", "blue"), { status: "agreed", winner: "blue" });
});

test("sends conflicting team votes to staff", () => {
  const votes: ResultVotes = {};
  recordVote(votes, "BLUE", "blue");
  assert.equal(recordVote(votes, "RED", "red").status, "disputed");
});
