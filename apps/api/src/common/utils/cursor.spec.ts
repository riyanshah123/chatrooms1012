import { decodeCursor, encodeCursor, toPage } from "./cursor";

describe("cursor codec", () => {
  it("round-trips timestamp + id", () => {
    const ts = new Date("2026-07-18T12:34:56.789Z");
    const cursor = decodeCursor(encodeCursor(ts, "clx123abc"));
    expect(cursor).not.toBeNull();
    expect(cursor!.ts.getTime()).toBe(ts.getTime());
    expect(cursor!.id).toBe("clx123abc");
  });

  it.each([
    [undefined, "absent"],
    [null, "null"],
    ["", "empty"],
    ["not-base64!!", "garbage"],
    [Buffer.from("justonepart").toString("base64url"), "missing id"],
    [Buffer.from("NaN:someid").toString("base64url"), "bad timestamp"],
  ])("returns null (first page) for %s (%s)", (input, _label) => {
    expect(decodeCursor(input as never)).toBeNull();
  });

  it("id survives colons via split-limit semantics", () => {
    // ids are cuid() (no colons), but a hostile cursor must not crash
    const raw = Buffer.from("123:id:with:colons").toString("base64url");
    const c = decodeCursor(raw);
    expect(c?.id).toBe("id"); // split(":")[1] — documented behavior
  });
});

describe("toPage", () => {
  const row = (n: number) => ({ id: `id${n}`, createdAt: new Date(2026, 0, n) });

  it("returns everything and a null cursor when under the limit", () => {
    const page = toPage([row(1), row(2)], 5, (r) => r);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("slices to the limit and points the cursor at the last returned row", () => {
    const rows = [row(5), row(4), row(3), row(2)]; // limit+1 fetched
    const page = toPage(rows, 3, (r) => r);
    expect(page.items.map((r) => r.id)).toEqual(["id5", "id4", "id3"]);
    const cursor = decodeCursor(page.nextCursor);
    expect(cursor?.id).toBe("id3");
  });
});
