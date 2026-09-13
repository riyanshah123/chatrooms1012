import {
  isReservedUsername,
  suggestUsername,
  suggestUsernames,
} from "./username.generator";

describe("suggestUsername", () => {
  it("matches the app's username policy (also enforced by zod)", () => {
    for (let i = 0; i < 200; i++) {
      const name = suggestUsername();
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(20);
    }
  });

  it("returns the requested number of distinct suggestions", () => {
    const batch = suggestUsernames(5);
    expect(batch).toHaveLength(5);
    expect(new Set(batch).size).toBe(5);
  });
});

describe("isReservedUsername", () => {
  it.each(["admin", "ADMIN", "Moderator", "system", "Chatrooms"])(
    "rejects %s case-insensitively",
    (name) => expect(isReservedUsername(name)).toBe(true),
  );

  it("allows normal names", () => {
    expect(isReservedUsername("BlueWolf21")).toBe(false);
  });
});
