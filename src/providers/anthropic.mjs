import { anthropicTools, readSSE } from "./http.mjs";

function content(message) {
  if (message.role === "assistant") {
    return [
      ...(message.content ? [{ type: "text", text: message.content }] : []),
      ...(message.calls || []).map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.input })),
    ];
  }
  if (message.role === "tool") return [{ type: "tool_result", tool_use_id: message.callId, content: message.content }];
  return message.content;
}

function mergeTurns(messages) {
  const output = [];
  for (const message of messages) {
    const role = message.role === "tool" ? "user" : message.role;
    const value = content(message);
    const last = output.at(-1);
    if (last?.role === role) {
      const previous = Array.isArray(last.content) ? last.content : [{ type: "text", text: last.content }];
      const next = Array.isArray(value) ? value : [{ type: "text", text: value }];
      last.content = [...previous, ...next];
    } else output.push({ role, content: value });
  }
  return output;
}

export class AnthropicProvider {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }
  async complete({ system, messages, tools, signal, onText }) {
    const response = await this.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, max_tokens: 8192, system, messages: mergeTurns(messages), tools: anthropicTools(tools), stream: true }),
      signal,
    });
    const blocks = new Map(); let text = ""; let usage = null; let completed = false;
    await readSSE(response, (event) => {
      if (event.type === "error") throw new Error(event.error?.message || "Anthropic streaming response failed.");
      if (event.type === "message_start") usage = event.message?.usage || usage;
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") blocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: "" });
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") { text += event.delta.text || ""; onText?.(event.delta.text || ""); }
      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") { const block = blocks.get(event.index); if (block) block.json += event.delta.partial_json || ""; }
      if (event.type === "message_delta" && event.usage) usage = { ...(usage || {}), ...event.usage };
      if (event.type === "message_stop") completed = true;
    });
    if (!completed) throw new Error("Anthropic stream closed before message_stop.");
    return { text, calls: [...blocks.values()].map((block) => ({ id: block.id, name: block.name, input: JSON.parse(block.json || "{}") })), usage };
  }
}
