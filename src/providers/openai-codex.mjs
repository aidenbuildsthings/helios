import crypto from "node:crypto";
import { accountIdFromToken, refreshOpenAI } from "../auth/openai-oauth.mjs";
import { openAITools, readSSE } from "./http.mjs";
import { assembleOpenAIEvents } from "./openai.mjs";

function input(messages) {
  return messages.flatMap((message) => {
    if (message.role === "tool") return [{ type: "function_call_output", call_id: message.callId, output: message.content }];
    if (message.role === "assistant" && message.calls?.length) return [...(message.content ? [{ role: "assistant", content: message.content }] : []), ...message.calls.map((call) => ({ type: "function_call", call_id: call.id, name: call.name, arguments: JSON.stringify(call.input) }))];
    return [{ role: message.role, content: message.content }];
  });
}

export function assembleCodexEvents(stream) {
  return assembleOpenAIEvents(stream);
}

export class OpenAICodexProvider {
  constructor({ auth, model, saveAuth, fetchImpl = fetch }) { Object.assign(this, { auth, model, saveAuth, fetch: fetchImpl }); }
  async token() {
    if (this.auth.expiresAt - Date.now() > 5 * 60_000) return this.auth.access;
    this.auth = await refreshOpenAI(this.auth.refresh);
    await this.saveAuth(this.auth);
    return this.auth.access;
  }
  async complete({ system, messages, tools, signal, onText }) {
    const token = await this.token();
    const accountId = accountIdFromToken(token);
    if (!accountId) throw new Error("OpenAI login token is missing a ChatGPT account identifier.");
    const session = crypto.randomUUID();
    const response = await this.fetch("https://chatgpt.com/backend-api/codex/responses", {
      method: "POST", signal,
      headers: { authorization: `Bearer ${token}`, "chatgpt-account-id": accountId, originator: "helios", "user-agent": "helios/0.1.0", "openai-beta": "responses=experimental", accept: "text/event-stream", "content-type": "application/json", session_id: session, "x-client-request-id": session },
      body: JSON.stringify({ model: this.model, store: false, stream: true, instructions: system, input: input(messages), tools: openAITools(tools), tool_choice: "auto", parallel_tool_calls: true, include: ["reasoning.encrypted_content"] }),
    });
    const stream = [];
    await readSSE(response, (event) => {
      if (event.type === "error" || event.type === "response.failed" || event.type === "response.incomplete") throw new Error(event.error?.message || event.response?.error?.message || event.response?.incomplete_details?.reason || "ChatGPT streaming response failed.");
      stream.push(event); if (event.type === "response.output_text.delta") onText?.(event.delta || "");
    });
    if (!stream.some((event) => event.type === "response.completed" || event.type === "response.done")) throw new Error("ChatGPT stream closed before response.completed.");
    return assembleCodexEvents(stream);
  }
}
