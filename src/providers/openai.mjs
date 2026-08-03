import { checkedJson, openAITools } from "./http.mjs";

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
  async complete({ system, messages, tools, signal }) {
    const data = await checkedJson(await this.fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, instructions: system, input: input(messages), tools: openAITools(tools), store: false }),
      signal,
    }));
    return {
      text: data.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n") || "",
      calls: data.output?.filter((item) => item.type === "function_call").map((item) => ({ id: item.call_id, name: item.name, input: JSON.parse(item.arguments || "{}") })) || [],
      usage: data.usage || null,
    };
  }
}
