import { plainToClass } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, validate } from "class-validator";
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

class GetAllQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email?: string;
}

export async function getSubscriptionsQueryValidation(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const queryDto = plainToClass(GetAllQueryDto, request.query);
  const errors = await validate(queryDto);

  if (errors.length > 0) {
    const formattedErrors = errors.map((err) => ({
      property: err.property,
      constraints: err.constraints,
    }));
    return response.status(400).json({ errors: formattedErrors });
  }

  next();
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
