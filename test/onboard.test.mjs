import assert from "node:assert/strict";
import test from "node:test";
import { chooseLaunch } from "../src/onboard.mjs";

test("onboarding offers one simple launch choice", async () => {
  let choices;
  const ui = { choose: async (_question, options) => { choices = options; return 0; } };
  assert.equal(await chooseLaunch(ui), true);
  assert.deepEqual(choices, ["Yes — open Helios", "Not right now"]);
});
