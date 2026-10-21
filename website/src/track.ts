// Anonymous usage counters for the admin page (see api/track.ts). Nothing personal is sent: just "a page was viewed",
// where the visitor came from, and which download button was pressed. The server stores counts, never IP addresses.
const send = (body: Record<string, string>) => {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return; // not while developing
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([data], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  fetch("/api/track", { method: "POST", body: data, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
};

const referrer = (): string => {
  const utm = new URLSearchParams(location.search).get("utm_source");
  if (utm) return utm;
  try {
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host && host !== location.hostname ? host : "";
  } catch {
    return "";
  }
};

// One view per browser session, so reloading the page does not inflate the count.
export function trackView() {
  try {
    if (sessionStorage.getItem("cocoflow-viewed")) return;
    sessionStorage.setItem("cocoflow-viewed", "1");
  } catch {
    /* storage blocked: count every load */
  }
  send({ type: "view", ref: referrer() });
}

export const trackDownload = (variant: "setup" | "full") => send({ type: "download", variant });
