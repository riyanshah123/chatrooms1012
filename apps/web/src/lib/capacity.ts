/**
 * Topic rooms are open to everyone, so their capacity is a sentinel rather
 * than a real limit. Anything this large means "no cap" and should be shown
 * as a plain head count instead of "5 / 100000".
 */
export const UNLIMITED_CAPACITY = 100_000;

export const isUnlimited = (capacity: number) => capacity >= UNLIMITED_CAPACITY;

/** "7 in room" for open rooms, "7/10 in room" for capped ones. */
export function occupancyLabel(count: number, capacity: number, suffix = ""): string {
  return isUnlimited(capacity)
    ? `${count}${suffix}`
    : `${count}/${capacity}${suffix}`;
}
