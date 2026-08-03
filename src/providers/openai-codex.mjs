import crypto from "node:crypto";
import { accountIdFromToken, refreshOpenAI } from "../auth/openai-oauth.mjs";
import { openAITools } from "./http.mjs";

function input(messages) {
  return messages.flatMap((message) => {
    if (message.role === "tool") return [{ type: "function_call_output", call_id: message.callId, output: message.content }];
    if (message.role === "assistant" && message.calls?.length) return [...(message.content ? [{ role: "assistant", content: message.content }] : []), ...message.calls.map((call) => ({ type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.input) }))];
    return [{ role: message.role, content: message.content }];
  });
}

async function events(response) {
  if (!response.ok) throw new Error(await response.text());
  const text = await response.text();
  return text.split(/\r?\n\r?\n/).flatMap((block) => block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim())).filter((line) => line && line !== "[DONE]").map((line) => JSON.parse(line));
}

export function assembleCodexEvents(stream) {
  const completed = [...stream].reverse().find((event) => event.type === "response.completed" || event.type === "response.done");
  const output = completed?.response?.output || [];
  const completedText = output.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
  const deltaText = stream.filter((event) => event.type === "response.output_text.delta").map((event) => event.delta || "").join("");
  const callItems = [
    ...output.filter((item) => item.type === "function_call"),
    ...stream.filter((event) => event.type === "response.output_item.done" && event.item?.type === "function_call").map((event) => event.item),
  ];
  const uniqueCalls = new Map();
  for (const item of callItems) {
    const id = item.call_id || item.id;
    if (!id || uniqueCalls.has(id)) continue;
    uniqueCalls.set(id, { id, name: item.name, input: JSON.parse(item.arguments || "{}") });
  }
  return { text: completedText || deltaText, calls: [...uniqueCalls.values()], usage: completed?.response?.usage || null };
}

export class OpenAICodexProvider {
  constructor({ auth, model, saveAuth, fetchImpl = fetch }) { Object.assign(this, { auth, model, saveAuth, fetch: fetchImpl }); }
  async token() {
    if (this.auth.expiresAt - Date.now() > 5 * 60_000) return this.auth.access;
    this.auth = await refreshOpenAI(this.auth.refresh);
    await this.saveAuth(this.auth);
    return this.auth.access;
  }
  async complete({ system, messages, tools, signal }) {
    const token = await this.token();
    const accountId = accountIdFromToken(token);
    if (!accountId) throw new Error("OpenAI login token is missing a ChatGPT account identifier.");
    const session = crypto.randomUUID();
    const response = await this.fetch("https://chatgpt.com/backend-api/codex/responses", {
      method: "POST", signal,
      headers: { authorization: `Bearer ${token}`, "chatgpt-account-id": accountId, originator: "helios", "user-agent": "helios/0.1.0", "openai-beta": "responses=experimental", accept: "text/event-stream", "content-type": "application/json", session_id: session, "x-client-request-id": session },
      body: JSON.stringify({ model: this.model, store: false, stream: true, instructions: system, input: input(messages), tools: openAITools(tools), tool_choice: "auto", parallel_tool_calls: true, include: ["reasoning.encrypted_content"] }),
    });
    const stream = await events(response);
    return assembleCodexEvents(stream);
  }
}
