// import pkg from "pg";
// const { Pool } = pkg;
// import * as dotenv from "dotenv";

// dotenv.config();

// const pool = new Pool({
//   user: process.env.DB_USER || "postgres",
//   host: process.env.DB_HOST || "localhost",
//   database: process.env.DB_NAME || "postgres",
//   port: parseInt(process.env.DB_PORT || "5430"),
//   password: process.env.DB_PASSWORD || "secretpass",
// });

// pool.on("connect", () => {
//   console.log("Connection pool established with database");
// });

// pool.on("error", (err) => {
//   console.error("Unexpected error on idle client", err);
//   process.exit(-1);
// });

// export default pool;
import pkg from "pg";
const { Pool } = pkg;
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "postgres",
  port: parseInt(process.env.DB_PORT || "5430"),
  password: process.env.DB_PASSWORD || "secretpass",
});

pool.on("connect", () => {
  console.log("Connection pool established with database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

export async function checkMigrationsTable() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'pgmigrations'
      );
    `);
    return result.rows[0].exists;
  } finally {
    client.release();
  }
}

export async function getCurrentMigrationVersion() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 1;
    `);
    return result.rows[0]?.name || null;
  } catch {
    return null;
  } finally {
    client.release();
  }
}

export default pool;
