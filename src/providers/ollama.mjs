import crypto from "node:crypto";
import { readNDJSON } from "./http.mjs";

function ollamaMessages(system, messages) {
  return [{ role: "system", content: system }, ...messages.map((message) => {
    if (message.role === "tool") return { role: "tool", content: message.content, tool_name: message.toolName };
    return { role: message.role, content: message.content || "", ...(message.calls?.length ? { tool_calls: message.calls.map((call) => ({ function: { name: call.name, arguments: call.input } })) } : {}) };
  })];
}

export class OllamaProvider {
  constructor({ model, host = "http://127.0.0.1:11434", apiKey, fetchImpl = fetch }) {
    const parsed = new URL(host);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Ollama host must use HTTP or HTTPS.");
    if (parsed.protocol === "http:" && !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) throw new Error("Remote Ollama hosts must use HTTPS.");
    this.model = model; this.host = parsed.origin; this.apiKey = apiKey; this.fetch = fetchImpl;
  }
  async complete({ system, messages, tools, signal, onText }) {
    const response = await this.fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, stream: true, messages: ollamaMessages(system, messages), tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }),
      signal,
    });
    let text = ""; const calls = []; let usage = null; let completed = false;
    await readNDJSON(response, (chunk) => {
      if (chunk.error) throw new Error(typeof chunk.error === "string" ? chunk.error : chunk.error.message || "Ollama streaming response failed.");
      const delta = chunk.message?.content || ""; text += delta; onText?.(delta);
      for (const call of chunk.message?.tool_calls || []) calls.push({ id: crypto.randomUUID(), name: call.function.name, input: call.function.arguments || {} });
      if (chunk.done) { completed = true; if (chunk.prompt_eval_count != null) usage = { input_tokens: chunk.prompt_eval_count, output_tokens: chunk.eval_count }; }
    });
    if (!completed) throw new Error("Ollama stream closed before its done event.");
    return { text, calls, usage };
  }
}
