import { RISK } from "../approval.mjs";
import { objectSchema } from "./registry.mjs";

export function capabilityTools({ capabilities, approvals }) {
  return [
    {
      name: "use_capability",
      description: "Load a learned capability's complete operating playbook before following it.",
      inputSchema: objectSchema({ id: { type: "string" } }, ["id"]),
      run: async ({ id }) => {
        const capability = await capabilities.get(id);
        if (!capability) return `No learned capability named ${id}.`;
        await capabilities.recordUse(capability);
        return `Capability: ${capability.name}\nUse when: ${capability.trigger}\n\nInstructions:\n${capability.instructions}\n\nVerification:\n${capability.verification}`;
      },
    },
    {
      name: "learn_capability",
      description: "Propose and build a reusable capability after completing or recognizing a stable repeatable workflow. Requires operator approval. Never use for secrets, temporary facts, or a one-off task.",
      inputSchema: objectSchema({
        name: { type: "string" }, description: { type: "string" }, trigger: { type: "string" },
        instructions: { type: "string" }, verification: { type: "string" },
      }, ["name", "description", "trigger", "instructions", "verification"]),
      run: async (input) => {
        const detail = `${input.description}\n\nUse when: ${input.trigger}\n\nVerification: ${input.verification}`;
        if (!(await approvals.require({ risk: RISK.WRITE, highRisk: true, title: `Learn “${input.name}”`, detail }))) return "Capability proposal rejected by operator.";
        const capability = await capabilities.create(input);
        return `Learned capability ${capability.id}. It will be available in future sessions.`;
      },
    },
    {
      name: "improve_capability",
      description: "Revise a learned capability after new execution evidence shows a durable improvement. Keeps revision history and requires operator approval.",
      inputSchema: objectSchema({
        id: { type: "string" }, description: { type: "string" }, trigger: { type: "string" },
        instructions: { type: "string" }, verification: { type: "string" },
        reason: { type: "string" }, evidence: { type: "string" },
      }, ["id", "description", "trigger", "instructions", "verification", "reason", "evidence"]),
      run: async (input) => {
        const current = await capabilities.get(input.id);
        if (!current) return `No learned capability named ${input.id}.`;
        const detail = `${input.reason}\n\nEvidence: ${input.evidence}`;
        if (!(await approvals.require({ risk: RISK.WRITE, highRisk: true, title: `Improve “${current.name}”`, detail }))) return "Capability improvement rejected by operator.";
        const capability = await capabilities.improve(input.id, input);
        return `Improved ${capability.id} to revision ${capability.revision}. The previous revision remains recoverable.`;
      },
    },
  ];
}
