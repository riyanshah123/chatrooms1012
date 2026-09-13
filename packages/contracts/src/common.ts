/** Envelope for every list endpoint. `nextCursor: null` ⇒ end of data. */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** Envelope for every error response. */
export interface ApiError {
  error: {
    /** Stable machine code, e.g. "ROOM_FULL", "VALIDATION_FAILED". */
    code: string;
    /** Human-readable, safe to show in a toast. */
    message: string;
    /** Optional field-level details (validation) or context (queue position). */
    details?: Record<string, unknown>;
  };
}

/** Public identity — the ONLY user shape non-admin endpoints ever return. */
export interface PublicProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  reputation: number;
}
