import { buildSystemPrompt } from "./prompt.mjs";

export class Agent {
  constructor({ provider, registry, store, capabilityStore, sessionId, workspace, learning = true, events = {}, maxToolRounds = 40 }) {
    Object.assign(this, { provider, registry, store, sessionId, workspace, learning, events, maxToolRounds });
    this.messages = [];
    this.system = null;
  }

  async initialize() {
    this.store.ensureSession(this.sessionId);
    this.messages = this.store.messages(this.sessionId);
    this.system = buildSystemPrompt({ workspace: this.workspace, memory: await this.store.memory(), instructions: await this.store.instructions?.() || "", capabilities: await this.capabilityStore?.list?.() || [], skills: this.store.skills?.() || [], workers: this.store.workers?.() || [], learning: this.learning });
    return this;
  }

  async send(text, signal) {
    const user = { role: "user", content: text };
    await this.store.log?.("User", text);
    this.messages.push(user);
    this.store.append(this.sessionId, user);
    for (let round = 0; round < this.maxToolRounds; round += 1) {
      this.events.status?.("thinking");
      const result = await this.provider.complete({
        system: this.system,
        messages: this.messages,
        tools: this.registry.definitions(),
        signal,
      });
      const assistant = { role: "assistant", content: result.text, calls: result.calls };
      this.messages.push(assistant);
      this.store.append(this.sessionId, assistant);
      if (!result.calls.length) {
        this.events.status?.("ready");
        if (!result.text?.trim()) {
          throw new Error("The model completed without returning text or a tool call. Helios did not treat the empty response as success.");
        }
        await this.store.log?.("Helios", result.text);
        return result.text;
      }
      for (const call of result.calls) {
        this.events.toolStart?.(call);
        const tool = this.registry.get(call.name);
        let output;
        try { output = tool ? await tool.run(call.input, { signal }) : `Unknown tool: ${call.name}`; }
        catch (error) { output = `Tool failed: ${error.message}`; }
        await this.store.log?.(String(output).startsWith("Tool failed:") ? "Error" : "Tool", `${call.name}\n\n${String(output).slice(0, 4000)}`);
        const toolMessage = { role: "tool", callId: call.id, content: String(output) };
        this.messages.push(toolMessage);
        this.store.append(this.sessionId, toolMessage);
        this.events.toolEnd?.(call, output);
      }
    }
    throw new Error(`Helios reached its ${this.maxToolRounds}-round safety limit.`);
  }
}
