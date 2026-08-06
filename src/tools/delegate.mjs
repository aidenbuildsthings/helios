import crypto from "node:crypto";
import { Agent } from "../agent/agent.mjs";
import { objectSchema } from "./registry.mjs";

export function delegateTool({ provider, registry, store, capabilityStore, workspace, parentSessionId, events }) {
  return {
    name: "delegate",
    description: "Assign one bounded independent research or analysis task to a worker. The worker returns its result to you and cannot delegate again.",
    inputSchema: objectSchema({ task: { type: "string" }, worker: { type: "string" } }, ["task"]),
    run: async ({ task, worker: workerId }, { signal } = {}) => {
      const workerRegistry = { definitions: () => registry.definitions().filter((tool) => tool.name !== "delegate"), get: (name) => name === "delegate" ? undefined : registry.get(name) };
      const childId = `${parentSessionId}:worker:${crypto.randomUUID()}`;
      events?.status?.("worker running");
      const profile = workerId ? store.worker(workerId) : null;
      if (workerId && !profile) return `No persistent worker named ${workerId}.`;
      const worker = await new Agent({ provider, registry: workerRegistry, store, capabilityStore, sessionId: childId, workspace, events: {}, maxToolRounds: 20 }).initialize();
      return worker.send(`You are a bounded worker.${profile ? `\nWorker: ${profile.name}\nInstructions: ${profile.instructions}` : ""}\nComplete only this assignment and return evidence and a concise result to the primary Helios agent:\n\n${task}`, signal);
    },
  };
}
