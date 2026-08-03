export class ToolRegistry {
  constructor() { this.tools = new Map(); }
  add(tool) {
    if (!tool?.name || typeof tool.run !== "function") throw new Error("Invalid Helios tool.");
    if (this.tools.has(tool.name)) throw new Error(`Duplicate Helios tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }
  definitions() {
    return [...this.tools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }
  get(name) { return this.tools.get(name); }
}

export const objectSchema = (properties, required = []) => ({
  type: "object", properties, required, additionalProperties: false,
});
