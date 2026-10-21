import type { VercelRequest, VercelResponse } from "@vercel/node";
import { KEEP, dayKey, ipHash, isBot, limit, visitorHash, withRedis } from "./_lib.js";

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

  const isView = body.type === "view";
  const variant = String(body.variant);
  if (!isView && !(body.type === "download" && VARIANTS.has(variant))) return res.status(400).end();

  const day = dayKey();
  const ok = await withRedis(async (redis) => {
    if (!(await limit(redis, `rl:track:${ipHash(req)}:${Math.floor(Date.now() / 60000)}`, 60, 120))) return false;

    const p = redis.multi();
    const hit = (key: string, field: string) => {
      p.hIncrBy(key, field, 1);
      p.expire(key, KEEP);
    };

    if (isView) {
      const ua = String(req.headers["user-agent"] ?? "");
      const country = clean(req.headers["x-vercel-ip-country"], 2).toUpperCase() || "??";
      const ref = clean(body.ref) || "direct";
      p.incr(`v:${day}`);
      p.expire(`v:${day}`, KEEP);
      p.incr("t:views");
      p.pfAdd(`u:${day}`, visitorHash(req, day));
      p.expire(`u:${day}`, KEEP);
      hit(`c:${day}`, country);
      hit(`r:${day}`, ref);
      hit(`dev:${day}`, /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : /windows/i.test(ua) ? "windows" : "other");
    } else {
      hit(`d:${day}`, variant);
      p.hIncrBy("t:dl", variant, 1);
    }
    await p.exec();
    return true;
  });
  return res.status(ok ? 204 : 429).end();
}
