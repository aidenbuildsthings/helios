import { anthropicTools, checkedJson } from "./http.mjs";

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
  async complete({ system, messages, tools, signal }) {
    const data = await checkedJson(await this.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, max_tokens: 8192, system, messages: mergeTurns(messages), tools: anthropicTools(tools) }),
      signal,
    }));
    return {
      text: data.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n") || "",
      calls: data.content?.filter((item) => item.type === "tool_use").map((item) => ({ id: item.id, name: item.name, input: item.input })) || [],
      usage: data.usage || null,
    };
  }
}
