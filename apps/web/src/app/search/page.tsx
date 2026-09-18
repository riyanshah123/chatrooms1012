import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { SearchView } from "@/components/search/search-view";

export const metadata: Metadata = { title: "Search" };

/** Full search page; the navbar's command-bar links here with ?q=. */
export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 sm:pb-24 pt-8 sm:px-6">
        <SearchView initialQuery={searchParams.q ?? ""} />
      </main>
    </>
  );
}
