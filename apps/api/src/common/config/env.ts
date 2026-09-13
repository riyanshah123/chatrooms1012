import { z } from "zod";

/**
 * Environment schema — the process refuses to boot on invalid/missing config,
 * so misconfiguration surfaces at deploy time, not at 3am under traffic.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Some hosts (Render) bind the app to a PORT env var they assign.
  API_PORT: z.coerce.number().int().positive().default(4000),
  PORT: z.coerce.number().int().positive().optional(),
  // Accepts a full URL (local dev) or a bare host (Render blueprint gives a
  // hostname) — normalized to https://. Optional so the API can boot even if
  // the web URL isn't wired yet (CORS then reflects the request origin).
  WEB_URL: z
    .string()
    .min(1)
    .transform((v) => (/^https?:\/\//.test(v) ? v : `https://${v}`))
    .optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "use a long random secret"),
  JWT_REFRESH_SECRET: z.string().min(32, "use a long random secret"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // Optional: search falls back to Postgres when OpenSearch is absent, so a
  // minimal deploy (Render/Railway with just DB + Redis) boots fine.
  OPENSEARCH_URL: z.string().url().optional(),

  // Optional: media uploads degrade gracefully without S3.
  S3_ENDPOINT: z.string().url().optional(), // unset in prod → default AWS endpoint
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(), // unset in prod → IAM role creds
  S3_SECRET_KEY: z.string().optional(),

  RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof envSchema>;

/** Passed to ConfigModule.forRoot({ validate }) — throws with a readable list. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
