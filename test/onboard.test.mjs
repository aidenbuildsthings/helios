import assert from "node:assert/strict";
import test from "node:test";
import { chooseHatch } from "../src/onboard.mjs";

test("macOS onboarding offers terminal, Desktop, and no hatch", async () => {
  let choices;
  const ui = { choose: async (_question, options) => { choices = options; return 1; } };
  assert.equal(await chooseHatch(ui, "darwin"), "desktop");
  assert.deepEqual(choices, ["TUI (Terminal)", "Desktop app", "Don't hatch right now"]);
});

test("non-macOS onboarding does not ask how to hatch", async () => {
  assert.equal(await chooseHatch({ choose: () => { throw new Error("unexpected prompt"); } }, "linux"), null);
});
