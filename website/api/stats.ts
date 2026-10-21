import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dayKey, ipHash, limit, passwordOk, withRedis } from "./_lib.js";

// Numbers for the admin page. Protected by the ADMIN_PASSWORD environment variable.
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const asMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") for (const [k, n] of Object.entries(v as Record<string, unknown>)) out[k] = num(n);
  return out;
};
const top = (m: Record<string, number>, n = 12) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
const merge = (into: Record<string, number>, from: Record<string, number>) => {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n;
};

const PER_DAY = 6; // commands queued per day below

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (req.method !== "GET") return res.status(405).end();

  const span = Math.min(90, Math.max(1, Number(req.query.days) || 30));
  const days: string[] = [];
  for (let i = span - 1; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86400000)));

  const r = await withRedis(async (redis) => {
    if (!passwordOk(req.headers["x-admin-key"] as string | undefined)) {
      // wrong guesses are limited so the password cannot be brute-forced
      const allowed = await limit(redis, `bf:${ipHash(req)}`, 10, 900);
      res.status(allowed ? 401 : 429).json({ error: allowed ? "unauthorized" : "too_many_attempts" });
      return null;
    }
    const p = redis.multi();
    for (const d of days) {
      p.get(`v:${d}`);
      p.pfCount(`u:${d}`);
      p.hGetAll(`d:${d}`);
      p.hGetAll(`c:${d}`);
      p.hGetAll(`r:${d}`);
      p.hGetAll(`dev:${d}`);
    }
    p.get("t:views");
    p.hGetAll("t:dl");
    return (await p.exec()) as unknown[];
  });
  if (!r) return;

  const countries: Record<string, number> = {};
  const referrers: Record<string, number> = {};
  const devices: Record<string, number> = {};
  let views = 0;
  let visitors = 0;
  let clicks = 0;
  const series = days.map((day, i) => {
    const b = i * PER_DAY;
    const dl = asMap(r[b + 2]);
    const downloads = Object.values(dl).reduce((a, n) => a + n, 0);
    const v = num(r[b]);
    const u = num(r[b + 1]);
    views += v;
    visitors += u;
    clicks += downloads;
    merge(countries, asMap(r[b + 3]));
    merge(referrers, asMap(r[b + 4]));
    merge(devices, asMap(r[b + 5]));
    return { day, views: v, visitors: u, downloads, setup: dl.setup ?? 0, full: dl.full ?? 0 };
  });

  const allDl = asMap(r[days.length * PER_DAY + 1]);
  return res.status(200).json({
    days: span,
    series,
    totals: { views, visitors, clicks },
    allTime: { views: num(r[days.length * PER_DAY]), setup: allDl.setup ?? 0, full: allDl.full ?? 0 },
    countries: top(countries),
    referrers: top(referrers),
    devices: top(devices),
  });
}
