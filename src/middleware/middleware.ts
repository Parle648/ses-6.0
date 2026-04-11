import { NextFunction, Request, Response } from "express";

export function loggingBefore(
  request: Request,
  response: Response,
  next?: NextFunction,
) {
  console.log("do something Before...");

  if (next) {
    next();
  }
}

export function loggingAfter(
  request: Request,
  response: Response,
  next?: NextFunction,
) {
  console.log("do something After...");
  if (next) {
    next();
  }
}
