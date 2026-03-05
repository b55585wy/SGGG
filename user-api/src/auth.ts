import type { NextFunction, Request, Response } from "express";
import { verifyUserToken, type JwtUserPayload } from "./jwt";

export type AuthenticatedRequest = Request & {
  user?: JwtUserPayload;
};

function extractToken(req: Request): string | null {
  // 1. Authorization: Bearer <token>
  const header = req.header("authorization") || "";
  const [scheme, bearerToken] = header.split(" ");
  if (scheme === "Bearer" && bearerToken) return bearerToken;

  // 2. httpOnly cookie fallback (persists across localStorage clears on iOS Safari)
  const cookieHeader = req.header("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === "noa_token") return decodeURIComponent(v.join("="));
  }

  return null;
}

export function authRequired(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ message: "未登录" });
    return;
  }

  try {
    req.user = verifyUserToken(token);
    next();
  } catch {
    res.status(401).json({ message: "登录已过期" });
  }
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    res.status(503).json({ message: "未配置管理员密钥" });
    return;
  }

  const got = req.header("x-admin-key") || "";
  if (got !== expected) {
    res.status(403).json({ message: "无权限" });
    return;
  }

  next();
}
