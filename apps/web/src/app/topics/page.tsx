import type { Metadata } from "next";
import { serverFetch } from "@/lib/api";
import type { Paginated } from "@chatrooms/contracts";
import { Navbar } from "@/components/layout/navbar";
import { TrendingTopics, type TopicCardData } from "@/components/feed/trending-topics";

export const metadata: Metadata = { title: "Topics" };

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
  const [topics, categories] = await Promise.all([
    serverFetch<Paginated<TopicCardData>>(`/topics${qs}`, { revalidate: 60 }),
    serverFetch<{ items: CategoryChip[] }>("/categories", { revalidate: 300 }),
  ]);

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6">
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
