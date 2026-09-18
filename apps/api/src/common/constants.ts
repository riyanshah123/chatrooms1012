/**
 * Topic rooms are open houses: anyone can walk in, so their chatroom carries a
 * capacity high enough to never be reached. Prompt rooms stay small (10) on
 * purpose, because that's what makes them feel like a real conversation.
 *
 * The client treats any capacity at or above this as "unlimited".
 */
export const UNLIMITED_CAPACITY = 100_000;

/** Seated people in one topic room before we open a parallel room for it. */
export const TOPIC_OVERFLOW_AT = 50;
