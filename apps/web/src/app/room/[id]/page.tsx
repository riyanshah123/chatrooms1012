import type { Metadata } from "next";
import { ChatRoom } from "@/components/chat/chat-room";

export const metadata: Metadata = { title: "Room" };

/**
 * The chatroom. Fully client-rendered: everything inside depends on auth
 * (join state, seat, socket), so SSR would only produce a shell. The
 * ChatRoom component handles: not-logged-in redirect, join / Room Full /
 * waiting-queue flows, realtime messages, presence, typing.
 */
export default function RoomPage({ params }: { params: { id: string } }) {
  return <ChatRoom roomId={params.id} />;
}
