/**
 * Central React Query key factory — invalidations and cache reads always
 * agree on shapes, and a rename can't silently orphan a cache entry.
 */
export const qk = {
  feed: (sort: string, category: string | null) => ["feed", sort, category] as const,
  topics: (category: string | null) => ["topics", category] as const,
  categories: ["categories"] as const,
  room: (roomId: string) => ["room", roomId] as const,
  messages: (roomId: string) => ["messages", roomId] as const,
  search: (q: string) => ["search", q] as const,
  profile: (username: string) => ["profile", username] as const,
  notifications: ["notifications"] as const,
  usernameSuggestions: ["username-suggestions"] as const,
} as const;
