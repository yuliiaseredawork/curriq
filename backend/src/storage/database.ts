import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Pool, type PoolClient } from "pg";

const secrets = new SecretsManagerClient({});
let secretCache:
  { expiresAt: number; value: Record<string, string | number> } | undefined;
let pool: Pool | undefined;

async function getDbConfig() {
  if (secretCache && secretCache.expiresAt > Date.now())
    return secretCache.value;
  const result = await secrets.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN! }),
  );
  if (!result.SecretString) throw new Error("DB_SECRET_EMPTY");
  const value = JSON.parse(result.SecretString) as Record<
    string,
    string | number
  >;
  secretCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
  return value;
}

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  const db = await getDbConfig();
  pool = new Pool({
    host: process.env.DB_PROXY_ENDPOINT ?? String(db.host),
    port: Number(db.port ?? 5432),
    database: String(db.dbname),
    user: String(db.username),
    password: String(db.password),
    ssl: { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX ?? 2),
    min: 0,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 30_000,
    application_name: process.env.SERVICE_NAME ?? "curriq-lambda",
  });
  pool.on("error", (error) => {
    console.error(
      JSON.stringify({ event: "db.pool_error", error: error.message }),
    );
  });
  return pool;
}

/**
 * A compatibility wrapper for repository code. `end()` releases the pooled
 * connection instead of closing a physical database connection, allowing warm
 * Lambda invocations to reuse RDS Proxy sessions.
 */
export async function createReusableClient(): Promise<{
  query: PoolClient["query"];
  end: () => Promise<void>;
}> {
  const client = await (await getPool()).connect();
  return {
    query: client.query.bind(client) as PoolClient["query"],
    end: async () => client.release(),
  };
}

export async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
