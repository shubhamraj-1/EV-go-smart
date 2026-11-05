import "server-only";

import { createDb } from "./index";

let _db: ReturnType<typeof createDb> | undefined;

export function db() {
  _db ??= createDb();
  return _db;
}
