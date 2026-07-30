import type { Request, Response, NextFunction } from "express";
import type { User } from "@workspace/db";
import { getUserFromRequest } from "../lib/session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Attaches req.user if a valid session cookie is present, but does not
// reject the request either way. Use `requireAuth` for protected routes.
export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const user = await getUserFromRequest(req);
  if (user) req.user = user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "غير مسجّل الدخول" });
    return;
  }
  next();
}
