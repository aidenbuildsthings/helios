import { RISK } from "../approval.mjs";
import { objectSchema } from "./registry.mjs";

export function memoryTools({ store, approvals }) {
  return [{
    name: "remember",
    description: "Save a stable business fact or preference for future conversations. Do not save secrets or temporary details.",
    inputSchema: objectSchema({ fact: { type: "string" } }, ["fact"]),
    run: async ({ fact }) => {
      if (!(await approvals.require({ risk: RISK.WRITE, title: "Remember this", detail: fact }))) return "Rejected by operator.";
      return `Saved: ${await store.remember(fact)}`;
    },
  }];
}
