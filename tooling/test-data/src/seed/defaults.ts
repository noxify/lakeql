/**
 * Static defaults for the local minitrino development environment.
 * These are hardcoded — no env-var handling needed.
 */
export const MINITRINO = {
  trino: {
    host: "http://localhost",
    port: 8080,
    catalog: "hive",
    auth: { type: "basic" as const, username: "admin", password: "" },
  },
  minio: {
    endpoint: "http://localhost:9000",
    bucket: "minitrino",
    region: "us-east-1",
    credentials: {
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
    },
  },
} as const
