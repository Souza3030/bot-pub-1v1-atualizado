import assert from "node:assert/strict";
import test from "node:test";
import { getRankByPoints } from "./rankTiers";

test("maps every rank boundary", () => {
  const cases: Array<[number, string]> = [
    [0, "Bronze"], [499, "Bronze"], [500, "Prata"], [999, "Prata"],
    [1_000, "Ouro"], [1_500, "Platina"], [2_000, "Diamante"],
    [2_500, "Mestre"], [3_000, "Elite"], [3_500, "Campeao"], [9_999, "Campeao"],
  ];
  cases.forEach(([points, rank]) => assert.equal(getRankByPoints(points).name, rank));
});
