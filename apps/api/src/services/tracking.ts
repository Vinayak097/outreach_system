import { config } from "../lib/config.js";

export function injectPixel(html: string, trackingId: string): string {
  const pixel = `<img src="${config.TRACKING_BASE_URL}/t/open/${trackingId}" width="1" height="1" alt="" style="display:none" />`;
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

export function looksLikeHardBounce(message: string): boolean {
  return /(^|\s)5\d{2}(\s|$)|5\.[0-9]\.[0-9]|mailbox\s+(does\s+not\s+exist|unavailable)|no\s+such\s+user|user\s+unknown/i.test(
    message,
  );
}
