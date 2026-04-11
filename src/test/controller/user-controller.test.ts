import bodyParser from "body-parser";
import { UserController } from "../../controllers/user-controller";
import { Info } from "../../model/info";
import { useExpressServer } from "routing-controllers";
import { GlobalErrorHandler } from "../../middleware/global-error-handler";
import express, { Express } from "express";
import request from "supertest";

const server: Express = express();

describe("UserController", () => {
  beforeAll(async () => {
    server.use(bodyParser.json());
    useExpressServer(server, {
      controllers: [UserController], // we specify controllers we want to use
      middlewares: [GlobalErrorHandler],
      defaultErrorHandler: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("postOne", () => {
    const userController = new UserController();
    const testBody = {
      city: "SPb",
    };
    const res = userController.postOne(testBody as Info);
    expect(res).toBeUndefined();
  });

  it("postOne with validations", (done) => {
    request(server)
      .post("/users")
      .send({
        country: "Ukraine",
        city: "Lviv",
      } as Info)
      .expect(200)
      .end((err, res) => {
        if (err) throw new Error(JSON.stringify(res.body));
        done();
      });
  });
});
