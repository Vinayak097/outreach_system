import { config } from "../lib/config.js";

const TRAILING_URL_PUNCTUATION_RE = /[),.!?]+$/;
const PLAIN_URL_RE = /(^|[\s(>])(https?:\/\/[^\s<]+)/gi;

function linkifyPlainUrls(text: string): string {
  return text.replace(PLAIN_URL_RE, (_match, prefix: string, rawUrl: string) => {
    let url = rawUrl;
    let trailing = "";
    while (TRAILING_URL_PUNCTUATION_RE.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    if (!url) return prefix + rawUrl;
    return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}

export function injectPixel(html: string, trackingId: string): string {
  const pixel = `<img src="${config.TRACKING_BASE_URL}/t/open/${trackingId}" width="1" height="1" alt="" aria-hidden="true" style="width:1px !important;height:1px !important;opacity:0 !important;border:0 !important;margin:0 !important;padding:0 !important;" />`;
  if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, `${pixel}</body>`);
  return html + pixel;
}

const HREF_RE = /(<a\b[^>]*\shref\s*=\s*)(["'])([^"']+)\2/gi;

export function rewriteLinks(html: string, trackingId: string): string {
  return html.replace(HREF_RE, (_match, prefix: string, quote: string, url: string) => {
    if (!/^https?:\/\//i.test(url)) return `${prefix}${quote}${url}${quote}`;
    if (url.startsWith(config.TRACKING_BASE_URL + "/t/")) return `${prefix}${quote}${url}${quote}`;
    const wrapped = `${config.TRACKING_BASE_URL}/t/click/${trackingId}?url=${encodeURIComponent(url)}`;
    return `${prefix}${quote}${wrapped}${quote}`;
  });
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return linkifyPlainUrls(escaped)
    .split(/\r?\n\r?\n/)
    .map((p) => `<p>${p.replace(/\r?\n/g, "<br>")}</p>`)
    .join("\n");
}

export function looksLikeHardBounce(message: string): boolean {
  return /(^|\s)5\d{2}(\s|$)|5\.[0-9]\.[0-9]|mailbox\s+(does\s+not\s+exist|unavailable)|no\s+such\s+user|user\s+unknown/i.test(
    message,
  );
}
