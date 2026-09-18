"use client";

import { create } from "zustand";

/**
 * Small pieces of cross-component UI state. Search lives here because both the
 * top bar and the mobile tab bar open the same overlay.
 */
interface UIState {
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  searchOpen: false,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
}));
