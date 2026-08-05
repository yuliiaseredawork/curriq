import { createHash } from "node:crypto";
import type { CloudFormationCustomResourceEvent } from "aws-lambda";
import { withTransaction } from "../storage/database";
import { latestMigrationVersion, migrations } from "./registry";

export async function applyMigrations(): Promise<string[]> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(28774471)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        description text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const existing = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM public.schema_migrations",
    );
    const applied = new Map(
      existing.rows.map((row) => [row.version, row.checksum]),
    );
    const newlyApplied: string[] = [];

    for (const migration of migrations) {
      const checksum = createHash("sha256").update(migration.sql).digest("hex");
      const prior = applied.get(migration.version);
      if (prior && prior !== checksum) {
        throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${migration.version}`);
      }
      if (prior) continue;
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO public.schema_migrations(version, description, checksum)
         VALUES ($1, $2, $3)`,
        [migration.version, migration.description, checksum],
      );
      newlyApplied.push(migration.version);
    }
    return newlyApplied;
  });
}

export async function handler(event: CloudFormationCustomResourceEvent) {
  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: `curriq-migrations-${latestMigrationVersion}`,
    };
  }
  const applied = await applyMigrations();
  return {
    PhysicalResourceId: `curriq-migrations-${latestMigrationVersion}`,
    Data: { LatestVersion: latestMigrationVersion, Applied: applied.join(",") },
  };
}
