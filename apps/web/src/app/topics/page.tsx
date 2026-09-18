import type { Metadata } from "next";
import { serverFetch } from "@/lib/api";
import type { Paginated } from "@chatrooms/contracts";
import { Navbar } from "@/components/layout/navbar";
import { TrendingTopics, type TopicCardData } from "@/components/feed/trending-topics";

export const metadata: Metadata = { title: "Topics" };

// Render at request time (the API isn't reachable during the build).
export const dynamic = "force-dynamic";

interface CategoryChip {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

/** Full-page topic browser; ?category=slug pre-applies a chip filter. */
export default async function TopicsPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const qs = searchParams.category ? `?category=${searchParams.category}` : "";
  // Resilient to a sleeping/cold-starting API — render, let the client hydrate.
  const [topics, categories] = await Promise.all([
    serverFetch<Paginated<TopicCardData>>(`/topics${qs}`, { revalidate: 60 }).catch(
      () => ({ items: [], nextCursor: null }) as Paginated<TopicCardData>,
    ),
    serverFetch<{ items: CategoryChip[] }>("/categories", { revalidate: 300 }).catch(
      () => ({ items: [] }),
    ),
  ]);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 sm:pb-24 pt-8 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Topics</h1>
        <p className="mt-1 text-muted">
          Permanent rooms for the big conversations — always open.
        </p>
        <TrendingTopics
          initialPage={topics}
          categories={categories.items}
          initialCategory={searchParams.category}
          standalone
        />
      </main>
    </>
  );
}
