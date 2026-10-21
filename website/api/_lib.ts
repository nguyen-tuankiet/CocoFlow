import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { Redis } from "@upstash/redis";

// The Upstash integration in Vercel injects KV_REST_API_*; a database made by hand on Upstash uses UPSTASH_REDIS_REST_*.
export function connect(): Redis {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Redis is not configured (KV_REST_API_URL / KV_REST_API_TOKEN)");
  return new Redis({ url, token });
}

export const KEEP = 60 * 60 * 24 * 400; // daily counters expire after ~13 months

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || (req.headers["x-real-ip"] as string) || "unknown";
}

// Visitors are never stored as IPs: a salted hash that changes every day, so nobody can be followed from one day to the next.
export function visitorHash(req: VercelRequest, day: string): string {
  const salt = process.env.ADMIN_PASSWORD ?? "";
  return sha(`${salt}|${day}|${clientIp(req)}|${req.headers["user-agent"] ?? ""}`).slice(0, 24);
}

export const isBot = (ua: string | undefined) =>
  !ua || /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|curl|wget|python|axios|node-fetch|go-http/i.test(ua);

export function passwordOk(given: string | undefined): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !given) return false;
  return timingSafeEqual(Buffer.from(sha(given)), Buffer.from(sha(expected)));
}

export const ipHash = (req: VercelRequest) => sha(clientIp(req)).slice(0, 16);

// Counts one hit in a bucket that expires after the window; false once the bucket is over its limit.
export async function limit(redis: Redis, bucket: string, max: number, windowSec: number): Promise<boolean> {
  const n = await redis.incr(bucket);
  if (n === 1) await redis.expire(bucket, windowSec);
  return n <= max;
}
