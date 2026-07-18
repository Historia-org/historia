import Fastify from "fastify";
import { Pool } from "pg";

const PORT = Number(process.env.API_PORT ?? 3001);
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://historia:historia_dev_change_me@localhost:5433/historia";

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const app = Fastify({ logger: true });

/** Liveness: the process responds. */
app.get("/health", async () => ({ status: "ok" }));

/** Readiness: the database responds, PostGIS is loaded, the seed is present. */
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

/**
 * Event detail + timeline breakpoints.
 * Breakpoints are the dates where the visible set of feature states changes;
 * the client snaps tile requests to them so HTTP caching stays effective.
 */
app.get<{ Params: { slug: string } }>(
  "/api/v1/events/:slug",
  async (req, reply) => {
    const { slug } = req.params;
    const [event, breakpoints, featureCount] = await Promise.all([
      pool.query(
        `SELECT slug, title, description_md,
                period_start_edtf, period_end_edtf,
                to_char(period_start, 'YYYY-MM-DD') AS period_start,
                to_char(period_end,   'YYYY-MM-DD') AS period_end
         FROM event WHERE slug = $1`,
        [slug]
      ),
      pool.query<{ d: string }>(
        "SELECT to_char(event_breakpoints($1), 'YYYY-MM-DD') AS d",
        [slug]
      ),
      pool.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM event_feature ef
         JOIN event e ON e.id = ef.event_id WHERE e.slug = $1`,
        [slug]
      ),
    ]);
    if (event.rowCount === 0) {
      reply.code(404);
      return { error: "event_not_found", slug };
    }
    return {
      ...event.rows[0],
      feature_count: Number(featureCount.rows[0]?.n ?? 0),
      breakpoints: breakpoints.rows.map((r) => r.d),
    };
  }
);

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
