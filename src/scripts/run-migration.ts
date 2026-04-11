import * as migrate from "node-pg-migrate";
import pool from "../config/db-connection";
import { getMigrationConfig } from "../config/migration-config";
import log4js from "log4js";
import { RunMigration } from "node-pg-migrate/migration";

const logger = log4js.getLogger();
logger.level = process.env.LOG_LEVEL || "info";

export async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info("Starting database migrations...");

    const config = getMigrationConfig(pool);

    const migrated = await migrate.runner({
      ...config,
      dbClient: client,
    });

    if (migrated.length > 0) {
      logger.info(`Successfully ran ${migrated.length} migration(s):`);
      migrated.forEach((migration: RunMigration) => {
        logger.info(`  - ${migration.name}`);
      });
    } else {
      logger.info("No new migrations to run.");
    }
  } catch (error) {
    logger.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}
