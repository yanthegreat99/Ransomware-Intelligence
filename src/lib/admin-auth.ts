import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "ransomware_analyst_session";

function sessionSecret(): string {
  const secret = process.env.ANALYST_ACCESS_SECRET;
  if (!secret) throw new Error("ANALYST_ACCESS_SECRET is not configured");
  return secret;
}

export function verifyAdminPassword(password: string): boolean {
  try {
    const secret = sessionSecret();
    const left = Buffer.from(password);
    const right = Buffer.from(secret);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export function createAdminSession(): string {
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `${expires}.${randomBytes(18).toString("base64url")}`;
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSession(cookieValue?: string): boolean {
  if (!cookieValue) return false;
  const separator = cookieValue.lastIndexOf(".");
  if (separator < 0) return false;
  const payload = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  try {
    const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
    const expires = Number(payload.split(".")[0]);
    return Number.isFinite(expires) && expires > Date.now();
  } catch {
    return false;
  }
}

export function authorizeAdminRequest(request: NextRequest): boolean {
  const configured = process.env.ANALYST_ACCESS_SECRET;
  const bearer = request.headers.get("authorization");
  if (configured && bearer === `Bearer ${configured}`) return true;
  return verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}
