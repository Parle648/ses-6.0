// import express, { Express, RequestHandler } from "express";
// import * as dotenv from "dotenv";
// import log4js from "log4js";
// import { UserController } from "./controllers/user-controller";
// import httpContext from "express-http-context";
// import { useExpressServer } from "routing-controllers";
// import { GlobalErrorHandler } from "./middleware/global-error-handler";
// import bodyParser from "body-parser";
// import swaggerUi from "swagger-ui-express";
// import * as swaggerDocument from "./swagger/open-api.json";
// import cors from "cors";
// import pool from "./config/db-connection";

// dotenv.config();

// const logger = log4js.getLogger();
// logger.level = process.env.LOG_LEVEL || "warn";

// const app: Express = express();
// app.use(bodyParser.json());
// app.use(httpContext.middleware);
// app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// app.use(cors() as RequestHandler);

// pool.query("SELECT NOW()", (err, res) => {
//   if (err) {
//     console.error("Database connection failed:", err);
//   } else {
//     console.log("Database connected successfully at:", res.rows[0].now);
//   }
// });

// useExpressServer(app, {
//   controllers: [UserController],
//   middlewares: [GlobalErrorHandler],
//   defaultErrorHandler: false,
// });

// const port = process.env.PORT || 6000;
// app.listen(port, () => console.log(`Running on port ${port}`));
// index.ts
import express, { Express, RequestHandler } from "express";
import * as dotenv from "dotenv";
import log4js from "log4js";
import { UserController } from "./controllers/user-controller";
import httpContext from "express-http-context";
import { useExpressServer } from "routing-controllers";
import { GlobalErrorHandler } from "./middleware/global-error-handler";
import bodyParser from "body-parser";
import swaggerUi from "swagger-ui-express";
import * as swaggerDocument from "./swagger/open-api.json";
import cors from "cors";
import pool, {
  checkMigrationsTable,
  getCurrentMigrationVersion,
} from "./config/db-connection";
import { runMigrations } from "./scripts/run-migration";

dotenv.config();

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || "warn";

const app: Express = express();
app.use(bodyParser.json());
app.use(httpContext.middleware);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(cors() as RequestHandler);

async function initializeDatabase() {
  try {
    const result = await pool.query("SELECT NOW()");
    logger.info(`Database connected successfully at: ${result.rows[0].now}`);

    const migrationsTableExists = await checkMigrationsTable();

    if (migrationsTableExists) {
      const currentVersion = await getCurrentMigrationVersion();
      logger.info(
        `Current database migration version: ${currentVersion || "none"}`,
      );
    } else {
      logger.info("Initializing database with migrations...");
    }

    await runMigrations();

    logger.info("Database initialization completed successfully");
  } catch (error) {
    logger.error("Database initialization failed:", error);
    throw error;
  }
}

initializeDatabase()
  .then(() => {
    useExpressServer(app, {
      controllers: [UserController],
      middlewares: [GlobalErrorHandler],
      defaultErrorHandler: false,
    });

    const port = process.env.PORT || 6000;
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`);
      logger.info(
        `Swagger documentation available at http://localhost:${port}/api-docs`,
      );
    });
  })
  .catch((error) => {
    logger.error("Failed to initialize application:", error);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT signal received: closing HTTP server");
  await pool.end();
  process.exit(0);
});
