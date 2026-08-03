export const RISK = Object.freeze({ READ: "read", WRITE: "write", EXECUTE: "execute", EXTERNAL: "external" });

export class ApprovalController {
  constructor(ask, options = {}) { this.ask = ask; this.mode = options.mode || "guarded"; }
  async require(action) {
    if (action.risk === RISK.READ) return true;
    if (this.mode === "autonomous" && !action.highRisk) return true;
    return this.ask(action);
  }
}
