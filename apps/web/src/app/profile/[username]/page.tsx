import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { serverFetch, ApiRequestError } from "@/lib/api";
import { Navbar } from "@/components/layout/navbar";
import { Avatar } from "@/components/ui/avatar";

// Render at request time (the API isn't reachable during the build).
export const dynamic = "force-dynamic";

interface PublicProfileData {
  id: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
  reputation: number;
  roomsCreated: number;
  roomsJoined: number;
  createdAt: string;
  favorites: Array<{ slug: string; title: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  return { title: `@${params.username}` };
}

/**
 * Public profile — server-rendered; shows ONLY the anonymous identity.
 * Real name/email never reach this surface (the API can't even return them).
 */
export default async function ProfilePage({
  params,
}: {
  params: { username: string };
}) {
  let profile: PublicProfileData;
  try {
    profile = await serverFetch<PublicProfileData>(
      `/profiles/${encodeURIComponent(params.username)}`,
      { revalidate: 60 },
    );
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }

  const stats = [
    { label: "Reputation", value: profile.reputation },
    { label: "Rooms created", value: profile.roomsCreated },
    { label: "Rooms joined", value: profile.roomsJoined },
  ];

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 sm:pb-24 pt-10 sm:px-6">
        <section className="glass animate-fade-up p-6 sm:p-8">
          <div className="flex items-center gap-5">
            <Avatar username={profile.username} src={profile.avatarUrl} size={72} />
            <div>
              <h1 className="font-display text-2xl font-bold">@{profile.username}</h1>
              <p className="text-sm text-muted">
                anonymous · joined{" "}
                {formatDistanceToNow(new Date(profile.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>

          {profile.bio && <p className="mt-5 text-ink/90">{profile.bio}</p>}

          <dl className="mt-6 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-surface-2 p-4 text-center">
                <dd className="font-display text-2xl font-bold">{s.value}</dd>
                <dt className="mt-0.5 text-xs text-muted">{s.label}</dt>
              </div>
            ))}
          </dl>

          {profile.favorites.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-medium text-muted">Favorite topics</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.favorites.map((t) => (
                  <a key={t.slug} href={`/search?q=${encodeURIComponent(t.title)}`} className="chip">
                    {t.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
