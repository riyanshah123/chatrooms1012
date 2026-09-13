import { randomInt } from "crypto";

/**
 * Suggests anonymous usernames like "BlueWolf21" — adjective + animal +
 * 2-digit number. ~40×40×90 ≈ 144k combinations per pattern; collisions are
 * handled by the caller retrying against the unique index.
 */
const ADJECTIVES = [
  "Blue", "Crimson", "Silent", "Swift", "Lucky", "Cosmic", "Golden", "Shadow",
  "Electric", "Frozen", "Brave", "Clever", "Neon", "Mystic", "Rapid", "Solar",
  "Lunar", "Wild", "Iron", "Velvet", "Turbo", "Zen", "Pixel", "Nova",
  "Quantum", "Scarlet", "Emerald", "Midnight", "Thunder", "Gentle", "Fierce",
  "Hidden", "Radiant", "Stormy", "Amber", "Onyx", "Ivory", "Jade", "Rusty", "Icy",
] as const;

const ANIMALS = [
  "Wolf", "Falcon", "Tiger", "Panda", "Otter", "Raven", "Fox", "Bear",
  "Hawk", "Lynx", "Cobra", "Dolphin", "Owl", "Panther", "Rabbit", "Shark",
  "Eagle", "Badger", "Moose", "Viper", "Heron", "Jaguar", "Koala", "Lemur",
  "Mantis", "Narwhal", "Ocelot", "Puffin", "Quokka", "Raccoon", "Sparrow",
  "Toucan", "Urchin", "Walrus", "Yak", "Zebra", "Gecko", "Bison", "Crane", "Dingo",
] as const;

export function suggestUsername(): string {
  const adj = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const animal = ANIMALS[randomInt(ANIMALS.length)];
  return `${adj}${animal}${randomInt(10, 100)}`;
}

/** A few options for the onboarding picker. */
export function suggestUsernames(count = 5): string[] {
  const out = new Set<string>();
  while (out.size < count) out.add(suggestUsername());
  return [...out];
}

/** Names that would confuse or impersonate — rejected at onboarding. */
const RESERVED = new Set([
  "admin", "administrator", "moderator", "mod", "system", "chatrooms",
  "support", "official", "root", "staff", "help", "api", "null", "undefined",
  "anonymous", "deleted",
]);

export function isReservedUsername(username: string): boolean {
  return RESERVED.has(username.toLowerCase());
}
