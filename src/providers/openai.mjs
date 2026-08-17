import { openAITools, readSSE } from "./http.mjs";

function input(messages) {
  return messages.flatMap((message) => {
    if (message.role === "tool") {
      return [{ type: "function_call_output", call_id: message.callId, output: message.content }];
    }
    if (message.role === "assistant" && message.calls?.length) {
      return [
        ...(message.content ? [{ role: "assistant", content: message.content }] : []),
        ...message.calls.map((call) => ({
          type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.input),
        })),
      ];
    }
    return [{ role: message.role, content: message.content }];
  });
}

export class OpenAIProvider {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
  }
  async complete({ system, messages, tools, signal, onText }) {
    const response = await this.fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, instructions: system, input: input(messages), tools: openAITools(tools), store: false, stream: true }),
      signal,
    });
    const events = [];
    await readSSE(response, (event) => {
      if (event.type === "error" || event.type === "response.failed" || event.type === "response.incomplete") throw new Error(event.error?.message || event.response?.error?.message || event.response?.incomplete_details?.reason || "OpenAI streaming response failed.");
      events.push(event); if (event.type === "response.output_text.delta") onText?.(event.delta || "");
    });
    if (!events.some((event) => event.type === "response.completed" || event.type === "response.done")) throw new Error("OpenAI stream closed before response.completed.");
    return assembleOpenAIEvents(events);
  }
}

export function assembleOpenAIEvents(events) {
  const completed = [...events].reverse().find((event) => event.type === "response.completed" || event.type === "response.done");
  const output = completed?.response?.output || [];
  const text = output.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n")
    || events.filter((event) => event.type === "response.output_text.delta").map((event) => event.delta || "").join("");
  const items = [...output.filter((item) => item.type === "function_call"), ...events.filter((event) => event.type === "response.output_item.done" && event.item?.type === "function_call").map((event) => event.item)];
  const calls = new Map();
  for (const item of items) {
    const id = item.call_id || item.id;
    if (id && !calls.has(id)) calls.set(id, { id, name: item.name, input: JSON.parse(item.arguments || "{}") });
  }
  return { text, calls: [...calls.values()], usage: completed?.response?.usage || null };
}
