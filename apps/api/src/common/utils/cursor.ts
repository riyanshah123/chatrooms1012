/**
 * Opaque keyset-pagination cursor: base64url of `<epochMillis>:<id>`.
 *
 * Queries use `WHERE (createdAt, id) < (:ts, :id) ORDER BY createdAt DESC,
 * id DESC LIMIT n` — stable under concurrent inserts (unlike OFFSET) and
 * served entirely by the composite indexes declared in schema.prisma.
 */
export interface Cursor {
  ts: Date;
  id: string;
}

export function encodeCursor(ts: Date, id: string): string {
  return Buffer.from(`${ts.getTime()}:${id}`, "utf8").toString("base64url");
}

/** Returns null for absent/garbage input — callers treat that as "first page". */
export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const [ms, id] = Buffer.from(raw, "base64url").toString("utf8").split(":");
    const ts = new Date(Number(ms));
    if (!id || Number.isNaN(ts.getTime())) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

/**
 * Shared page-slicing helper: fetch limit+1 rows, return page + nextCursor.
 * `getKey` extracts the (createdAt, id) pair from a row.
 */
export function toPage<T>(
  rows: T[],
  limit: number,
  getKey: (row: T) => { createdAt: Date; id: string },
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(getKey(last).createdAt, getKey(last).id) : null,
  };
}
