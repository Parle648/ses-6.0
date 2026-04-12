import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
} from "class-validator";

const repoRegex = new RegExp("^[^/]+/[^/]+$");

export class Subscription {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @Matches(repoRegex)
  repo: string;
}
