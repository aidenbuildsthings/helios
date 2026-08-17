import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "../src/agent/agent.mjs";
import { ToolRegistry, objectSchema } from "../src/tools/registry.mjs";

test("agent executes a tool and returns the verified result", async () => {
  const calls = [];
  const provider = {
    async complete({ messages }) {
      calls.push(messages);
      return calls.length === 1
        ? { text: "", calls: [{ id: "call-1", name: "answer", input: {} }] }
        : { text: "The verified answer is 42.", calls: [] };
    },
  };
  const registry = new ToolRegistry().add({
    name: "answer", description: "Answer", inputSchema: objectSchema({}), run: async () => "42",
  });
  const saved = [];
  const store = {
    ensureSession() {}, messages: () => [], memory: async () => "", append: (_id, message) => saved.push(message),
  };
  const agent = await new Agent({ provider, registry, store, sessionId: "s", workspace: "/tmp" }).initialize();
  assert.equal(await agent.send("What is it?"), "The verified answer is 42.");
  assert.equal(calls.length, 2);
  assert.equal(saved.at(-2).role, "tool");
});

test("agent surfaces an empty provider response instead of claiming Done", async () => {
  const provider = { complete: async () => ({ text: "", calls: [] }) };
  const store = { ensureSession() {}, messages: () => [], memory: async () => "", append() {} };
  const agent = await new Agent({ provider, registry: new ToolRegistry(), store, sessionId: "s", workspace: "/tmp" }).initialize();
  await assert.rejects(() => agent.send("hello"), /without returning text/);
});

test("agent forwards streamed text and does not persist a partial assistant on cancellation", async () => {
  const events = []; const saved = [];
  const provider = { complete: async ({ onText, signal }) => {
    onText("partial");
    if (signal.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { name: "AbortError" })), { once: true }));
  } };
  const store = { ensureSession() {}, messages: () => [], memory: async () => "", append: (_id, value) => saved.push(value) };
  const agent = await new Agent({ provider, registry: new ToolRegistry(), store, sessionId: "s", workspace: "/tmp", events: { responseStart: () => events.push("start"), responseDelta: (delta) => events.push(delta) } }).initialize();
  const controller = new AbortController(); const pending = agent.send("hello", controller.signal); setImmediate(() => controller.abort());
  await assert.rejects(pending, /cancelled/);
  assert.deepEqual(events, ["start", "partial"]);
  assert.deepEqual(saved.map((message) => message.role), ["user"]);
});
