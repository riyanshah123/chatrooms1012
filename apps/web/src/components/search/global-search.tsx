"use client";

import { useUIStore } from "@/stores/ui";
import { SearchCommand } from "./search-command";

/**
 * Mounts the search overlay once for the whole app, driven by shared UI state,
 * so both the desktop top bar and the mobile tab bar open the same thing.
 */
export function GlobalSearch() {
  const { searchOpen, closeSearch } = useUIStore();
  return <SearchCommand open={searchOpen} onClose={closeSearch} />;
}
