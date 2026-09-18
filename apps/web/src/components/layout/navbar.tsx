"use client";

import Link from "next/link";
import { LogOut, MessageSquare, Plus, Search, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "./theme-toggle";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";

/**
 * Sticky navbar (TopicTalk-style): coral chat-bubble logo + wordmark,
 * a Discover link, then search / create / theme / auth on the right.
 * Auth state comes from the zustand store; a neutral placeholder shows
 * while the silent session restore is in flight.
 */
export function Navbar() {
  const { status, profile, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const openSearch = useUIStore((s) => s.openSearch);

  // ⌘K / Ctrl-K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center gap-5 px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-sm">
            <MessageSquare size={18} className="fill-accent-ink" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">
            chatrooms<span className="text-accent">101</span>
          </span>
        </Link>

        <Link
          href="/topics"
          className="mr-auto hidden text-[15px] font-medium text-muted transition-colors hover:text-ink sm:block"
        >
          Topics
        </Link>

        {/* Desktop: a real-looking search bar; mobile: an icon. Both open the
            live search overlay. */}
        <button
          onClick={() => openSearch()}
          className="hidden h-9 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm text-muted transition hover:border-ink/30 hover:text-ink sm:flex"
        >
          <Search size={15} />
          <span>Search…</span>
          <kbd className="ml-2 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
            ⌘K
          </kbd>
        </button>
        <button
          onClick={() => openSearch()}
          aria-label="Search"
          className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink sm:hidden"
        >
          <Search size={18} />
        </button>

        {status === "authenticated" && (
          <Link
            href="/create"
            className="btn-primary hidden h-10 rounded-full px-4 text-sm sm:inline-flex"
          >
            <Plus size={17} strokeWidth={2.5} />
            New Topic
          </Link>
        )}

        <ThemeToggle />

        {status === "authenticated" && profile ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Account menu"
              className="block rounded-full ring-accent/40 transition hover:ring-2"
            >
              <Avatar username={profile.username} src={profile.avatarUrl} size={36} />
            </button>
            {menuOpen && (
              <div
                className="glass absolute right-0 top-12 w-48 overflow-hidden p-1.5 shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <p className="truncate px-3 py-2 text-sm font-medium">@{profile.username}</p>
                <Link
                  href={`/profile/${profile.username}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-ink"
                >
                  <User size={15} /> Profile
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-danger"
                >
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </div>
        ) : status === "anonymous" ? (
          <>
            <Link href="/login" className="hidden text-[15px] font-medium text-muted transition-colors hover:text-ink sm:block">
              Log in
            </Link>
            <Link href="/signup" className="btn-primary h-10 rounded-full px-5 text-sm">
              Sign up
            </Link>
          </>
        ) : (
          <div className="h-10 w-24 animate-pulse rounded-full bg-surface-2" />
        )}
      </nav>

    </header>
  );
}
