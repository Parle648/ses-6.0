import {
  ExpressErrorMiddlewareInterface,
  Middleware,
} from "routing-controllers";
import { Request, Response, NextFunction } from "express";

@Middleware({ type: "after" })
export class GlobalErrorHandler implements ExpressErrorMiddlewareInterface {
  error(
    error: Error,
    request: Request,
    response: Response,
    next: NextFunction,
  ) {
    response.send({ ERROR: error });
    next();
  }
}
