import type { VercelRequest, VercelResponse } from "@vercel/node";
import { KEEP, connect, dayKey, ipHash, isBot, limit, visitorHash } from "./_lib.js";

// Receives one event from the landing page: a page view or a click on a download button.
const VARIANTS = new Set(["setup", "full"]);
const clean = (s: unknown, max = 60) => (typeof s === "string" ? s.trim().toLowerCase().slice(0, max) : "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (isBot(req.headers["user-agent"])) return res.status(204).end();

  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
  } catch {
    return res.status(400).end();
  }

  const redis = connect();
  const day = dayKey();
  if (!(await limit(redis, `rl:track:${ipHash(req)}:${Math.floor(Date.now() / 60000)}`, 60, 120))) return res.status(429).end();

  const p = redis.pipeline();
  const hit = (key: string, field: string) => {
    p.hincrby(key, field, 1);
    p.expire(key, KEEP);
  };

  if (body.type === "view") {
    const ua = String(req.headers["user-agent"] ?? "");
    const country = clean(req.headers["x-vercel-ip-country"], 2).toUpperCase() || "??";
    const ref = clean(body.ref) || "direct";
    p.incr(`v:${day}`);
    p.expire(`v:${day}`, KEEP);
    p.incr("t:views");
    p.pfadd(`u:${day}`, visitorHash(req, day));
    p.expire(`u:${day}`, KEEP);
    hit(`c:${day}`, country);
    hit(`r:${day}`, ref);
    hit(`dev:${day}`, /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : /windows/i.test(ua) ? "windows" : "other");
  } else if (body.type === "download" && VARIANTS.has(String(body.variant))) {
    const variant = String(body.variant);
    hit(`d:${day}`, variant);
    p.hincrby("t:dl", variant, 1);
  } else {
    return res.status(400).end();
  }

  await p.exec();
  return res.status(204).end();
}
