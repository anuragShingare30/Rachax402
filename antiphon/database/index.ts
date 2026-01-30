import { SqliteDatabaseAdapter } from "@elizaos/adapter-sqlite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export function initializeDatabase(dataDir: string) {
  const filePath = process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error("Failed to create data dir:", err);
      return new SqliteDatabaseAdapter(new Database(":memory:"));
    }
  }
  try {
    return new SqliteDatabaseAdapter(new Database(filePath));
  } catch (err) {
    console.error("SQLite open failed, using in-memory:", err);
    return new SqliteDatabaseAdapter(new Database(":memory:"));
  }
}