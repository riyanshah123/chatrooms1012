import { z } from "zod";

/** Zod schemas are the single validation layer for auth inputs. */

/**
 * Known disposable/throwaway mail providers. Not exhaustive by design: the
 * confirmation email is what actually proves an address works. This just
 * removes the laziest abuse before we spend a send on it.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "trashmail.com",
  "sharklasers.com", "getnada.com", "dispostable.com", "fakeinbox.com",
  "maildrop.cc", "mailnesia.com", "mintemail.com", "spamgourmet.com",
  "tempr.email", "discard.email", "mohmal.com", "emailondeck.com",
  "example.com", "test.com", "asdf.com",
]);

export const signupSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase().trim())
    .refine(
      (v) => !DISPOSABLE_DOMAINS.has(v.split("@")[1] ?? ""),
      "Use a real email address, that one won't receive the confirmation.",
    ),
  // Length-first policy (NIST): long passphrases beat composition rules.
  password: z.string().min(10, "at least 10 characters").max(128),
});
export type SignupDto = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

/**
 * Anonymous username: 3–20 chars, letters/digits/underscore, must start with
 * a letter. Displayed exactly as typed; uniqueness is case-insensitive.
 */
export const usernameSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "letters, digits and _ only; start with a letter"),
});
export type UsernameDto = z.infer<typeof usernameSchema>;
