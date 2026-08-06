import crypto from "node:crypto";
import { checkedJson } from "./http.mjs";

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
  async complete({ system, messages, tools, signal }) {
    const response = await checkedJson(await this.fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ model: this.model, stream: false, messages: ollamaMessages(system, messages), tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }),
      signal,
    }));
    return {
      text: response.message?.content || "",
      calls: (response.message?.tool_calls || []).map((call) => ({ id: crypto.randomUUID(), name: call.function.name, input: call.function.arguments || {} })),
      usage: response.prompt_eval_count == null ? null : { input_tokens: response.prompt_eval_count, output_tokens: response.eval_count },
    };
  }
}
