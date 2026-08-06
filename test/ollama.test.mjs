import assert from "node:assert/strict";
import test from "node:test";
import { OllamaProvider } from "../src/providers/ollama.mjs";

test("Ollama provider parses native tool calls", async () => {
  const provider = new OllamaProvider({ model: "qwen3", fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); assert.equal(body.stream, false); assert.equal(body.tools[0].function.name, "read_file");
    return new Response(JSON.stringify({ message: { content: "", tool_calls: [{ function: { name: "read_file", arguments: { path: "a.txt" } } }] } }));
  } });
  const result = await provider.complete({ system: "test", messages: [], tools: [{ name: "read_file", description: "Read", inputSchema: { type: "object" } }] });
  assert.equal(result.calls[0].name, "read_file"); assert.deepEqual(result.calls[0].input, { path: "a.txt" });
});

test("Ollama rejects unencrypted remote hosts", () => {
  assert.throws(() => new OllamaProvider({ model: "x", host: "http://example.com:11434" }), /HTTPS/);
});
