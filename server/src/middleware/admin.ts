import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler";

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    next(new AppError("无权访问此页面。", 403));
    return;
  }
  next();
}
