import Link from "next/link";
import { Compass, Hash, MessageSquare, Plus, Users, Zap } from "lucide-react";
import { serverFetch } from "@/lib/api";
import type { Paginated } from "@chatrooms/contracts";
import { Navbar } from "@/components/layout/navbar";
import { PromptFeed, type FeedPromptCard } from "@/components/feed/prompt-feed";
import { TrendingPrompts } from "@/components/feed/trending-prompts";
import { TrendingTopics, type TopicCardData } from "@/components/feed/trending-topics";

interface CategoryChip {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

interface PlatformStats {
  activeRooms: number;
  topics: number;
  messagesToday: number;
  users: number;
}

const ZERO_STATS: PlatformStats = { activeRooms: 0, topics: 0, messagesToday: 0, users: 0 };

// Render at request time (the API isn't reachable during the build).
export const dynamic = "force-dynamic";

/**
 * Landing page — TopicTalk-style: centered hero (badge → gradient headline →
 * subtext → CTA → live stat cards), then the endless prompt feed and
 * trending topics. Server-rendered for SEO + instant paint.
 */
export default async function HomePage() {
  const [feed, trending, categories, topics, stats] = await Promise.all([
    serverFetch<Paginated<FeedPromptCard>>("/prompts?sort=new", { revalidate: 30 }),
    serverFetch<{ items: FeedPromptCard[] }>("/prompts/trending", { revalidate: 30 }),
    serverFetch<{ items: CategoryChip[] }>("/categories", { revalidate: 300 }),
    serverFetch<Paginated<TopicCardData>>("/topics", { revalidate: 60 }),
    serverFetch<PlatformStats>("/stats", { revalidate: 30 }).catch(() => ZERO_STATS),
  ]);

  const statCards = [
    { icon: MessageSquare, value: stats.activeRooms, label: "Active Rooms" },
    { icon: Hash, value: stats.topics, label: "Topics" },
    { icon: Zap, value: stats.messagesToday, label: "Messages Today" },
    { icon: Users, value: stats.users, label: "Users" },
  ];

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        {/* Hero */}
        <section className="flex flex-col items-center py-14 text-center sm:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
            <Zap size={13} className="fill-white" />
            The Digital Town Square
          </span>

          <h1 className="mt-7 font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
            Real talk.
            <br />
            <span className="bg-gradient-to-r from-[#E0603C] via-[#E14A7B] to-[#D63C9A] bg-clip-text text-transparent">
              Real people.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-muted">
            Join intimate, capped chatrooms about topics you actually care
            about. Ten seats, real conversations — and always anonymous.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/create" className="btn-primary h-12 rounded-full px-7 text-base shadow-lg shadow-accent/20">
              <Plus size={19} strokeWidth={2.5} />
              Start a Discussion
            </Link>
            <a href="#feed" className="btn-ghost h-12 rounded-full px-7 text-base">
              Explore Topics
              <Compass size={18} />
            </a>
          </div>

          {/* Live stats */}
          <div className="mt-14 grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.label} className="glass flex flex-col items-center gap-1.5 px-4 py-5">
                <s.icon size={20} className="text-muted" />
                <span className="font-display text-3xl font-bold tabular-nums">{s.value}</span>
                <span className="text-sm text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Trending prompts — highest traffic right now */}
        <section className="pt-4">
          <div className="mb-5 flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">Trending</h2>
              <p className="mt-1 text-muted">The most active discussions right now.</p>
            </div>
          </div>
          <TrendingPrompts initial={trending.items} />
        </section>

        {/* Feed — "For You" (personalized when logged in) */}
        <div id="feed" className="scroll-mt-20 pt-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">For You</h2>
              <p className="mt-1 text-muted">
                Picked from the topics you follow — plus the latest everywhere.
              </p>
            </div>
            <Link
              href="/create"
              className="btn-primary hidden h-11 shrink-0 rounded-full px-5 sm:inline-flex"
            >
              <Plus size={18} strokeWidth={2.5} />
              New Topic
            </Link>
          </div>
          <PromptFeed initialPage={feed} categories={categories.items} />
        </div>

        {/* Trending topics */}
        <TrendingTopics initialPage={topics} categories={categories.items} />
      </main>

      {/* Mobile floating "create" button — the navbar/header CTAs are hidden
          on small screens, so this keeps starting a discussion one tap away. */}
      <Link
        href="/create"
        aria-label="Start a discussion"
        className="btn-primary fixed bottom-6 right-5 z-40 size-14 rounded-full !px-0 shadow-xl shadow-accent/30 sm:hidden"
      >
        <Plus size={26} strokeWidth={2.5} />
      </Link>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        chatrooms101 — real talk, real people.
      </footer>
    </>
  );
}
