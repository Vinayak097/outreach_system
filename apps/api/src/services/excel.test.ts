import type { ColumnMapping } from "@outreach/shared";
import { describe, expect, it } from "vitest";
import { isReplied, isValidEmail, planImport, validateMapping, type ParsedWorkbook } from "./excel.js";

describe("validateMapping", () => {
  const headers = ["Email", "First", "Last", "Industry"];

  it("requires email", () => {
    expect(validateMapping({ email: "", custom: [] }, headers)).toEqual({
      ok: false,
      error: "email column is required",
    });
  });

  it("rejects an email column not in the sheet", () => {
    expect(validateMapping({ email: "NotThere", custom: [] }, headers)).toEqual({
      ok: false,
      error: 'email column "NotThere" not in sheet',
    });
  });

  it("rejects unmapped optional columns", () => {
    const m: ColumnMapping = { email: "Email", firstName: "NotThere", custom: [] };
    expect(validateMapping(m, headers)).toEqual({
      ok: false,
      error: 'column "NotThere" mapped to firstName is not in the sheet',
    });
  });

  it("rejects custom columns not in sheet", () => {
    expect(validateMapping({ email: "Email", custom: ["missing"] }, headers)).toEqual({
      ok: false,
      error: 'custom column "missing" not in sheet',
    });
  });

  it("accepts valid mapping", () => {
    const m: ColumnMapping = {
      email: "Email",
      firstName: "First",
      custom: ["Industry"],
    };
    expect(validateMapping(m, headers)).toEqual({ ok: true });
  });
});

describe("isValidEmail", () => {
  it.each([
    ["alice@example.com", true],
    ["foo+bar@sub.example.co.uk", true],
    ["no-at-sign", false],
    ["spaces @example.com", false],
    ["@example.com", false],
    ["foo@", false],
  ])("%s => %s", (input, expected) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});

describe("isReplied", () => {
  it.each(["yes", "YES", "Y", "true", "1", "replied", " YES "])("truthy: %s", (v) => {
    expect(isReplied(v)).toBe(true);
  });
  it.each(["no", "", "false", "0", "maybe"])("falsy: %s", (v) => {
    expect(isReplied(v)).toBe(false);
  });
});

describe("planImport (replyStatus rule + custom fields)", () => {
  const wb: ParsedWorkbook = {
    headers: ["Email", "First", "Industry", "Replied"],
    rows: [
      { index: 0, values: { Email: "a@x.com", First: "Alice", Industry: "SaaS", Replied: "" } },
      { index: 1, values: { Email: "bad", First: "Bob", Industry: "Fintech", Replied: "" } },
      { index: 2, values: { Email: "c@x.com", First: "Carol", Industry: "Health", Replied: "yes" } },
      { index: 3, values: { Email: "d@x.com", First: "Dave", Industry: "Media", Replied: "no" } },
    ],
  };

  const mapping: ColumnMapping = {
    email: "Email",
    firstName: "First",
    replyStatus: "Replied",
    custom: ["Industry"],
  };

  it("skips invalid emails, marks pre-replied, and stores custom with slugged key", () => {
    const out = planImport(wb, mapping);
    expect(out.imported).toBe(3);
    expect(out.skipped).toBe(1);
    expect(out.preReplied).toBe(1);
    expect(out.leads).toHaveLength(3);

    const alice = out.leads.find((l) => l.email === "a@x.com")!;
    expect(alice.status).toBe("pending");
    expect(JSON.parse(alice.customFields)).toEqual({ industry: "SaaS" });

    const carol = out.leads.find((l) => l.email === "c@x.com")!;
    expect(carol.status).toBe("replied");

    const dave = out.leads.find((l) => l.email === "d@x.com")!;
    expect(dave.status).toBe("pending");
  });
});
