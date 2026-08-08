import crypto from "node:crypto";
import { Agent } from "../agent/agent.mjs";
import { objectSchema } from "./registry.mjs";

export function delegateTool({ provider, providerForWorker, registry, store, capabilityStore, workspace, parentSessionId, events }) {
  return {
    name: "delegate",
    description: "Assign one bounded independent task to a purpose-built subagent. The subagent returns its result and cannot delegate again.",
    inputSchema: objectSchema({ task: { type: "string" }, worker: { type: "string" } }, ["task"]),
    run: async ({ task, worker: workerId }, { signal } = {}) => {
      const workerRegistry = { definitions: () => registry.definitions().filter((tool) => tool.name !== "delegate"), get: (name) => name === "delegate" ? undefined : registry.get(name) };
      const childId = `${parentSessionId}:worker:${crypto.randomUUID()}`;
      const profile = workerId ? store.worker(workerId) : null;
      if (workerId && !profile) return `No persistent subagent named ${workerId}.`;
      const title = String(task).slice(0, 180);
      store.saveSubagentTask({ id: childId, workerId: profile?.id, title, status: "queued" });
      try {
        const selectedProvider = profile && providerForWorker ? await providerForWorker(profile) : provider;
        store.saveSubagentTask({ id: childId, workerId: profile?.id, title, status: "running" });
        events?.status?.("subagent running");
        const worker = await new Agent({ provider: selectedProvider, registry: workerRegistry, store, capabilityStore, sessionId: childId, workspace, events: {}, maxToolRounds: 20 }).initialize();
        const result = await worker.send(`You are a bounded Helios subagent.${profile ? `\nName: ${profile.name}\nPurpose: ${profile.instructions}` : ""}\nComplete only this assignment and return evidence and a concise result to the primary Helios agent:\n\n${task}`, signal);
        store.saveSubagentTask({ id: childId, workerId: profile?.id, title, status: "done", result: String(result).slice(0, 20_000) });
        return result;
      } catch (error) {
        store.saveSubagentTask({ id: childId, workerId: profile?.id, title, status: "failed", result: String(error.message || error).slice(0, 20_000) });
        throw error;
      }
    },
  };
}
