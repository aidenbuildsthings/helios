import assert from "node:assert/strict";
import test from "node:test";
import { cronMatches, validateCron } from "../src/scheduler.mjs";

test("cron matcher supports ranges, lists, and steps", () => {
  const monday = new Date(2026, 7, 3, 9, 30);
  assert.equal(cronMatches("*/15 9-17 * * 1-5", monday), true);
  assert.equal(cronMatches("0 9 * * 1-5", monday), false);
  assert.throws(() => validateCron("every day"), /five fields/);
});
