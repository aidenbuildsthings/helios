import assert from "node:assert/strict";
import test from "node:test";
import { cronMatches, latestCronSlot, validateCron } from "../src/scheduler.mjs";

test("cron matcher supports ranges, lists, and steps", () => {
  const monday = new Date(2026, 7, 3, 9, 30);
  assert.equal(cronMatches("*/15 9-17 * * 1-5", monday), true);
  assert.equal(cronMatches("0 9 * * 1-5", monday), false);
  assert.throws(() => validateCron("every day"), /five fields/);
});

test("scheduler recovers the latest missed minute without replaying a backlog", () => {
  const now = new Date("2026-08-03T12:10:42.000Z");
  assert.equal(latestCronSlot("* * * * *", now, "2026-08-03T12:05"), "2026-08-03T12:10");
  assert.equal(latestCronSlot("* * * * *", now, "2026-08-03T12:10"), null);
});
