import assert from "node:assert/strict";
import test from "node:test";
import { chooseLaunch, collectName } from "../src/onboard.mjs";

test("onboarding offers one simple launch choice", async () => {
  let choices;
  const ui = { choose: async (_question, options) => { choices = options; return 0; } };
  assert.equal(await chooseLaunch(ui), true);
  assert.deepEqual(choices, ["Yes — open Helios", "Not right now"]);
});

test("onboarding asks what Helios should call the user", async () => {
  const prompts = [];
  const ui = { question: async (prompt) => { prompts.push(prompt); return "Aiden"; }, line: () => {} };
  assert.equal(await collectName(ui), "Aiden");
  assert.match(prompts[0], /Hi, I'm Helios\. What can I call you\?/);
});
