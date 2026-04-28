import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "file:./dev.db");
  vi.stubEnv("JWT_SECRET", "1234567890123456");
  vi.stubEnv("ADMIN_PASSWORD", "admin");
  vi.stubEnv("ENCRYPTION_KEY", "0000000000000000000000000000000000000000000000000000000000000000");
  vi.stubEnv("TRACKING_BASE_URL", "https://tracker.example.com");
  vi.stubEnv("FRONTEND_URL", "http://localhost:5173");
});

describe("tracking helpers", () => {
  it("injects an invisible 1px tracking image without display none", async () => {
    const { injectPixel } = await import("./tracking.js");
    const html = injectPixel("<html><body><p>Hello</p></body></html>", "abc123");

    expect(html).toContain('src="https://tracker.example.com/t/open/abc123"');
    expect(html).toContain('width="1" height="1"');
    expect(html).not.toContain("display:none");
  });

  it("converts plain text urls into anchor tags", async () => {
    const { textToHtml } = await import("./tracking.js");
    const html = textToHtml("See https://example.com/path?x=1&y=2 for details");

    expect(html).toContain('<a href="https://example.com/path?x=1&amp;y=2"');
    expect(html).toContain(">https://example.com/path?x=1&amp;y=2</a>");
  });

  it("keeps trailing punctuation outside the link", async () => {
    const { textToHtml } = await import("./tracking.js");
    const html = textToHtml("Visit https://example.com/test.");

    expect(html).toContain('<a href="https://example.com/test"');
    expect(html).toContain("</a>.");
  });

  it("rewrites absolute links through the click tracker", async () => {
    const { rewriteLinks } = await import("./tracking.js");
    const html = rewriteLinks('<a href="https://example.com">Example</a>', "track-1");

    expect(html).toContain('href="https://tracker.example.com/t/click/track-1?url=https%3A%2F%2Fexample.com"');
  });
});
