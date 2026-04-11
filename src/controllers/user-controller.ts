import {
  Action,
  Body,
  Controller,
  Get,
  OnUndefined,
  Param,
  Post,
  UseAfter,
  UseBefore,
  UseInterceptor,
} from "routing-controllers";
import "reflect-metadata";
import { loggingAfter, loggingBefore } from "../middleware/middleware";
import { Info } from "../model/info";

@Controller()
@UseBefore(loggingBefore)
@UseAfter(loggingAfter)
@UseInterceptor(function (action: Action, content: unknown) {
  console.log("change response...");
  content = "interceptor";
  return content;
})
export class UserController {
  @Get("/users/:id")
  getOne(@Param("id") id: number) {
    return "This action returns user #" + id;
  }

  @Post("/users/")
  @OnUndefined(204)
  postOne(@Body() info: Info) {
    console.log(JSON.stringify(info));
  }
}
