import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Users } from "lucide-react";
import { serverFetch, ApiRequestError } from "@/lib/api";
import type { PublicProfile, Visibility } from "@chatrooms/contracts";
import { Navbar } from "@/components/layout/navbar";
import { Avatar } from "@/components/ui/avatar";

interface PromptDetail {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  category: { slug: string; name: string; icon: string | null };
  creator: PublicProfile;
  chatroomId: string;
  visibility: Visibility;
  maxUsers: number;
  onlineCount: number;
  messageCount: number;
  createdAt: string;
}

interface PublicRoom {
  id: string;
  capacity: number;
  memberCount: number;
  onlineCount: number;
  members: PublicProfile[];
}

/**
 * Prompt detail page (TopicTalk-style): left column has the prompt (category,
 * title, description card, tags, creator); right column is the "Active Rooms"
 * panel — a live preview of who's in the room with a Join Room CTA.
 */
export default async function PromptDetailPage({ params }: { params: { id: string } }) {
  let prompt: PromptDetail;
  try {
    prompt = await serverFetch<PromptDetail>(`/prompts/${params.id}`, { revalidate: 15 });
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  const room = await serverFetch<PublicRoom>(`/chatrooms/${prompt.chatroomId}/public`, {
    revalidate: 10,
  }).catch(() => null);

  const online = room?.onlineCount ?? prompt.onlineCount;
  const seated = room?.memberCount ?? prompt.onlineCount;
  const capacity = room?.capacity ?? prompt.maxUsers;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-ink"
        >
          <ArrowLeft size={16} /> Back to Discover
        </Link>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Left — the prompt */}
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
              {prompt.category.icon} {prompt.category.name}
            </span>

            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              {prompt.title}
            </h1>

            {prompt.description && (
              <div className="glass mt-6 p-5">
                <p className="text-lg leading-relaxed text-muted">{prompt.description}</p>
              </div>
            )}

            {prompt.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {prompt.tags.map((t) => (
                  <span key={t} className="pill">
                    # {t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
              <Avatar username={prompt.creator.username} src={prompt.creator.avatarUrl} size={40} />
              <div>
                <p className="text-sm font-semibold">Started by @{prompt.creator.username}</p>
                <p className="text-xs text-muted">Max {capacity} people per room</p>
              </div>
            </div>
          </div>

          {/* Right — Active Rooms panel */}
          <div className="glass p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold">Active Rooms</h2>
                <p className="mt-0.5 text-muted">Jump into a live conversation</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-medium">
                <span className="size-2 rounded-full bg-emerald-500" />
                {online} online
              </span>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between">
                <p className="font-display font-bold">Discussion Room</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-semibold text-accent">
                  <Users size={12} />
                  {seated}/{capacity}
                </span>
              </div>

              {/* Member avatar stack */}
              {room && room.members.length > 0 ? (
                <div className="mt-4 flex items-center">
                  {room.members.slice(0, 8).map((m, i) => (
                    <div
                      key={m.id}
                      className="rounded-full ring-2 ring-surface"
                      style={{ marginLeft: i === 0 ? 0 : -8 }}
                    >
                      <Avatar username={m.username} src={m.avatarUrl} size={32} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted">Be the first one in — start the conversation.</p>
              )}

              <Link
                href={`/room/${prompt.chatroomId}`}
                className="btn-primary mt-5 h-11 w-full rounded-xl text-base"
              >
                Join Room
                <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
