import { describe, expect, it } from "vitest";
import { render } from "./templating.js";

describe("render", () => {
  it("substitutes top-level fields", () => {
    const out = render("Hi {{first_name}} at {{company}}", {
      first_name: "Alice",
      company: "Acme",
    });
    expect(out).toBe("Hi Alice at Acme");
  });

  it("handles custom.<key>", () => {
    const out = render("Industry: {{custom.industry}}", {
      custom: { industry: "SaaS" },
    });
    expect(out).toBe("Industry: SaaS");
  });

  it("renders missing vars as empty string", () => {
    const out = render("Hi {{first_name}} at {{company}}", {
      first_name: "Alice",
    });
    expect(out).toBe("Hi Alice at ");
  });

  it("ignores whitespace inside braces", () => {
    const out = render("{{ first_name }}", { first_name: "Bob" });
    expect(out).toBe("Bob");
  });

  it("leaves non-template text untouched", () => {
    const out = render("no variables here", {});
    expect(out).toBe("no variables here");
  });

  it("handles missing custom subkey", () => {
    const out = render("{{custom.missing}}", { custom: {} });
    expect(out).toBe("");
  });
});
