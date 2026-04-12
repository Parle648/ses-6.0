import {
  Middleware,
  ExpressErrorMiddlewareInterface,
} from "routing-controllers";
import { ValidationError } from "class-validator";
import { Request, Response } from "express";

export interface AppError extends Error {
  errors?: ValidationError[];
  httpCode?: number;
  status?: number;
}

@Middleware({ type: "after" })
export class GlobalErrorHandler implements ExpressErrorMiddlewareInterface {
  error(error: AppError, request: Request, response: Response) {
    if (
      Array.isArray(error.errors) &&
      error.errors[0] instanceof ValidationError
    ) {
      return response.status(400).json({
        status: 400,
        name: "ValidationError",
        message: "Validation failed",
        errors: this.formatValidationErrors(error.errors),
        timestamp: new Date().toISOString(),
      });
    }

    if (error.name === "BadRequestError") {
      return response.status(400).json({
        status: 400,
        name: "BadRequestError",
        message: error.message || "Bad Request",
        errors: error.errors || [],
        timestamp: new Date().toISOString(),
      });
    }

    const status = error.httpCode || error.status || 500;
    response.status(status).json({
      status,
      name: error.name || "InternalServerError",
      message: error.message || "Internal Server Error",
      timestamp: new Date().toISOString(),
    });
  }

  private formatValidationErrors(errors: ValidationError[]) {
    return errors.map((error) => ({
      property: error.property,
      constraints: error.constraints,
      value: error.value,
    }));
  }
}
