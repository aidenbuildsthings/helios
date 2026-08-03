import assert from "node:assert/strict";
import test from "node:test";
import { computerTools } from "../src/tools/computer.mjs";

test("computer use ships as a built-in structured toolset", async () => {
  const tools = await computerTools({ approvals: { require: async () => true } });
  assert.deepEqual(tools.map((tool) => tool.name), ["computer_apps", "computer_inspect", "computer_press", "computer_set_value", "computer_shortcut"]);
});
