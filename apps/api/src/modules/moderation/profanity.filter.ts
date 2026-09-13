/**
 * Profanity filter: normalizes leet-speak/spacing tricks, masks matches.
 * Word list is intentionally small here — in production it's loaded from
 * config/DB so moderators can extend it without a deploy.
 */
const BLOCKLIST = [
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "cunt", "slut",
  "whore", "nigger", "faggot", "retard",
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a",
  "$": "s", "!": "i",
};

function normalize(word: string): string {
  return word
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/(.)\1{2,}/g, "$1$1"); // collapse "fuuuuck" → "fuuck"
}

export interface FilterResult {
  clean: string; // content with matches masked: "f***"
  hadProfanity: boolean;
}

export function filterProfanity(content: string): FilterResult {
  let hadProfanity = false;
  const clean = content
    .split(/(\s+)/) // keep whitespace tokens so spacing is preserved
    .map((token) => {
      const normalized = normalize(token.replace(/[^\p{L}\p{N}@$!]/gu, ""));
      if (normalized && BLOCKLIST.some((w) => normalized.includes(w))) {
        hadProfanity = true;
        return token[0] + "*".repeat(Math.max(token.length - 1, 2));
      }
      return token;
    })
    .join("");
  return { clean, hadProfanity };
}

/** Strip control chars (keep \n and \t); escaping happens at render time in
 *  React — the API stores plain text and never interprets it as HTML. */
export function sanitizeText(content: string): string {
  let out = "";
  for (const ch of content) {
    const code = ch.codePointAt(0)!;
    const isControl = (code < 32 && code !== 10 && code !== 9) || code === 127;
    if (!isControl) out += ch;
  }
  return out.trim();
}
