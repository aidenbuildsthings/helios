import assert from "node:assert/strict";
import test from "node:test";
import { compactContext } from "../src/agent/context.mjs";

test("context compaction preserves recent complete turns and summarizes older history", () => {
  const messages = [];
  for (let index = 0; index < 12; index += 1) {
    messages.push({ role: "user", content: `request ${index} ${"x".repeat(400)}` });
    messages.push({ role: "assistant", content: `answer ${index} ${"y".repeat(400)}` });
  }
  const compacted = compactContext(messages, 800);
  assert.ok(compacted.length < messages.length);
  assert.match(compacted[0].content, /Earlier conversation was compacted/);
  assert.equal(compacted[1].role, "user");
  assert.match(compacted.at(-1).content, /answer 11/);
  assert.ok(JSON.stringify(compacted).length <= 3_300);
});

test("short context remains byte-for-byte unchanged", () => {
  const messages = [{ role: "user", content: "hello" }];
  assert.equal(compactContext(messages), messages);
});
