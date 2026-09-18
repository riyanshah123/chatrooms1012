"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hash, Home, Plus, Search, User } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";

/**
 * Thumb-reachable navigation for phones.
 *
 * Hidden on desktop (the top bar covers it) and inside a room, where the
 * message composer owns the bottom of the screen. Sits above the iOS home
 * indicator via the safe-area inset.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { status, profile } = useAuthStore();
  const openSearch = useUIStore((s) => s.openSearch);

  // A room is a focused, full-height surface; a tab bar would fight the composer.
  if (pathname?.startsWith("/room/")) return null;

  const meHref =
    status === "authenticated" && profile ? `/profile/${profile.username}` : "/login";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : !!pathname?.startsWith(href);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 backdrop-blur-xl sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        <Tab href="/" label="Home" active={isActive("/")}>
          <Home size={21} />
        </Tab>
        <Tab href="/topics" label="Topics" active={isActive("/topics")}>
          <Hash size={21} />
        </Tab>

        {/* Create sits dead centre: it's the action we most want people taking. */}
        <Link
          href="/create"
          aria-label="Start a discussion"
          className="flex flex-1 flex-col items-center justify-center py-1.5"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-ink shadow-md shadow-accent/30">
            <Plus size={24} strokeWidth={2.5} />
          </span>
        </Link>

        <button
          onClick={openSearch}
          aria-label="Search"
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted transition-colors"
        >
          <Search size={21} />
          Search
        </button>

        <Tab href={meHref} label={status === "authenticated" ? "Me" : "Log in"} active={isActive("/profile")}>
          <User size={21} />
        </Tab>
      </div>
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      {children}
      {label}
    </Link>
  );
}
