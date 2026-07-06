import Fastify from "fastify";
import { Pool } from "pg";

const PORT = Number(process.env.API_PORT ?? 3001);
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://historia:historia_dev_change_me@localhost:5432/historia";

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const app = Fastify({ logger: true });

/** Liveness : le process répond. */
app.get("/health", async () => ({ status: "ok" }));

/** Readiness : la base répond, PostGIS est chargé, le seed est présent. */
app.get("/api/v1/meta", async (_req, reply) => {
  try {
    const [pg, events] = await Promise.all([
      pool.query<{ postgis: string }>("SELECT postgis_version() AS postgis"),
      pool.query<{ slug: string; title: string }>(
        "SELECT slug, title FROM event ORDER BY id"
      ),
    ]);
    return {
      name: "historia-api",
      version: "0.1.0",
      postgis: pg.rows[0]?.postgis ?? null,
      events: events.rows,
    };
  } catch (err) {
    reply.code(503);
    return { name: "historia-api", version: "0.1.0", db_error: String(err) };
  }
});

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
