import { filterProfanity, sanitizeText } from "./profanity.filter";

describe("filterProfanity", () => {
  it("passes clean text through unchanged", () => {
    const r = filterProfanity("what a lovely debate about football");
    expect(r.hadProfanity).toBe(false);
    expect(r.clean).toBe("what a lovely debate about football");
  });

  it("masks direct matches, preserving surrounding text", () => {
    const r = filterProfanity("well shit happens");
    expect(r.hadProfanity).toBe(true);
    expect(r.clean).toBe("well s*** happens");
  });

  it("catches leet-speak variants", () => {
    expect(filterProfanity("sh1t").hadProfanity).toBe(true);
    expect(filterProfanity("$hit").hadProfanity).toBe(true);
  });

  it("catches stretched letters", () => {
    expect(filterProfanity("shiiiiit").hadProfanity).toBe(true);
  });

  it("catches slurs embedded in longer tokens", () => {
    expect(filterProfanity("youbitchxx").hadProfanity).toBe(true);
  });

  it("documents the aggressive substring policy (Scunthorpe tradeoff)", () => {
    expect(filterProfanity("scunthorpe").hadProfanity).toBe(true);
  });
});

describe("sanitizeText", () => {
  it("strips control characters but keeps newlines and tabs", () => {
    const nul = String.fromCharCode(0);
    const esc = String.fromCharCode(27);
    const del = String.fromCharCode(127);
    expect(sanitizeText(`a${nul}b${esc}c\nd\te${del}`)).toBe("abc\nd\te");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeText("  hello \n")).toBe("hello");
  });
});
