import { getDb } from "./db";
import { daysBetween, todayChile } from "./format";

export type AdminMetrics = {
  users: number;
  loads: number;
  trucks: number;
  expiring: number;
  expired: number;
};

export function adminMetrics(today = todayChile()): AdminMetrics {
  const db = getDb();
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const docs = db.prepare(`SELECT expiry FROM documents`).all() as { expiry: string }[];
  let expiring = 0;
  let expired = 0;
  for (const doc of docs) {
    const days = daysBetween(today, doc.expiry);
    if (days < 0) expired += 1;
    else if (days <= 30) expiring += 1;
  }
  return {
    users: count(`SELECT COUNT(*) AS n FROM users`),
    loads: count(`SELECT COUNT(*) AS n FROM loads`),
    trucks: count(`SELECT COUNT(*) AS n FROM trucks`),
    expiring,
    expired,
  };
}
