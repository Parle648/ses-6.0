import { IsDefined, IsNotEmpty, IsString } from "class-validator";

export class Info {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  country: string | undefined;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  city: string | undefined;
}
