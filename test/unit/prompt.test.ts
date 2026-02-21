import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, TOOL_DEFINITION } from "../../src/prompt.js";

describe("SYSTEM_PROMPT", () => {
  it("should be a non-empty string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});

describe("TOOL_DEFINITION", () => {
  it('should have name "create_github_issue"', () => {
    expect(TOOL_DEFINITION.name).toBe("create_github_issue");
  });

  it("should require title and body in input_schema", () => {
    const schema = TOOL_DEFINITION.input_schema;
    expect(schema.required).toContain("title");
    expect(schema.required).toContain("body");
  });

  it("should have title, body, and labels properties", () => {
    const props = TOOL_DEFINITION.input_schema.properties;
    expect(props).toHaveProperty("title");
    expect(props).toHaveProperty("body");
    expect(props).toHaveProperty("labels");
  });

  it("should not require labels", () => {
    expect(TOOL_DEFINITION.input_schema.required).not.toContain("labels");
  });
});
