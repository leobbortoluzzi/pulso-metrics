import initialMigration from "../migrations/0001_initial.sql?raw"
import workspaceMigration from "../migrations/0002_workspace_setup.sql?raw"
import funnelMigration from "../migrations/0003_funnel_metrics.sql?raw"

// Keep this registry in sync with the ordered SQL files in migrations/.
const migrations = [
  { name: "0001_initial.sql", sql: initialMigration },
  { name: "0002_workspace_setup.sql", sql: workspaceMigration },
  { name: "0003_funnel_metrics.sql", sql: funnelMigration },
]

const migrationTable = "d1_migrations"

export async function ensureDatabaseSchema(database: D1Database) {
  let appliedMigrations: { name: string }[] = []

  try {
    const result = await database
      .prepare(`SELECT name FROM ${migrationTable}`)
      .all<{ name: string }>()
    appliedMigrations = result.results
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(`no such table: ${migrationTable}`)
    ) {
      throw error
    }
  }

  const appliedNames = new Set(appliedMigrations.map(({ name }) => name))
  const pendingMigrations = migrations.filter(
    ({ name }) => !appliedNames.has(name)
  )
  if (!pendingMigrations.length) return

  await database
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `
    )
    .run()

  const statements = pendingMigrations.flatMap(({ name, sql }) => {
    const queries = sql
      .replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/i, "")
      .split(";")
      .map((query) => query.trim())
      .filter(Boolean)

    return [
      ...queries.map((query) => database.prepare(query)),
      database
        .prepare(`INSERT OR IGNORE INTO ${migrationTable} (name) VALUES (?)`)
        .bind(name),
    ]
  })

  await database.batch(statements)
}
