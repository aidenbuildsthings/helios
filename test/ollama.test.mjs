import assert from "node:assert/strict";
import test from "node:test";
import { OllamaProvider } from "../src/providers/ollama.mjs";

test("Ollama provider parses native tool calls", async () => {
  const provider = new OllamaProvider({ model: "qwen3", fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); assert.equal(body.stream, true); assert.equal(body.tools[0].function.name, "read_file");
    const toolChunk = { message: { content: "", tool_calls: [{ function: { name: "read_file", arguments: { path: "a.txt" } } }] } };
    const doneChunk = { done: true, prompt_eval_count: 4, eval_count: 2 };
    return new Response(`${JSON.stringify(toolChunk)}\n${JSON.stringify(doneChunk)}\n`);
  } });
  const result = await provider.complete({ system: "test", messages: [], tools: [{ name: "read_file", description: "Read", inputSchema: { type: "object" } }] });
  assert.equal(result.calls[0].name, "read_file"); assert.deepEqual(result.calls[0].input, { path: "a.txt" });
});

test("Ollama rejects unencrypted remote hosts", () => {
  assert.throws(() => new OllamaProvider({ model: "x", host: "http://example.com:11434" }), /HTTPS/);
});
