import { Pool } from "pg";

export const getMigrationConfig = (pool: Pool) => ({
  databaseUrl: {
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "postgres",
    port: parseInt(process.env.DB_PORT || "5430"),
    password: process.env.DB_PASSWORD || "secretpass",
  },
  dir: "src/migration",
  direction: "up" as const,
  migrationsTable: "pgmigrations",
  pool,
});
