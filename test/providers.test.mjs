import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIProvider } from "../src/providers/openai.mjs";
import { AnthropicProvider } from "../src/providers/anthropic.mjs";
import { assembleCodexEvents, OpenAICodexProvider } from "../src/providers/openai-codex.mjs";

const response = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("OpenAI adapter parses Responses API tool calls", async () => {
  const provider = new OpenAIProvider({ apiKey: "test", model: "test", fetchImpl: async () => response({ output: [{ type: "function_call", call_id: "1", name: "read_file", arguments: "{\"path\":\"a\"}" }] }) });
  const result = await provider.complete({ system: "s", messages: [], tools: [] });
  assert.deepEqual(result.calls[0].input, { path: "a" });
});

test("Anthropic adapter parses native tool use", async () => {
  const provider = new AnthropicProvider({ apiKey: "test", model: "test", fetchImpl: async () => response({ content: [{ type: "tool_use", id: "1", name: "read_file", input: { path: "a" } }] }) });
  const result = await provider.complete({ system: "s", messages: [{ role: "user", content: "read" }], tools: [] });
  assert.equal(result.calls[0].name, "read_file");
});

test("ChatGPT adapter parses Codex Responses SSE", async () => {
  const payload = Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account" } })).toString("base64url");
  const token = `header.${payload}.signature`;
  const event = { type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }] } };
  const provider = new OpenAICodexProvider({ auth: { access: token, refresh: "r", expiresAt: Date.now() + 60_000_000 }, model: "test", saveAuth: async () => {}, fetchImpl: async () => new Response(`data: ${JSON.stringify(event)}\n\n`, { status: 200 }) });
  const result = await provider.complete({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [] });
  assert.equal(result.text, "hello");
});

test("ChatGPT adapter assembles text from streaming deltas when the terminal event omits output", () => {
  const result = assembleCodexEvents([
    { type: "response.output_text.delta", delta: "hel" },
    { type: "response.output_text.delta", delta: "lo" },
    { type: "response.completed", response: { status: "completed" } },
  ]);
  assert.equal(result.text, "hello");
});
