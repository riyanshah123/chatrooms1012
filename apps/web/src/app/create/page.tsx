import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { CreatePromptForm } from "@/components/feed/create-prompt-form";

export const metadata: Metadata = { title: "Start a discussion" };

export default function CreatePage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold">Start a discussion</h1>
        <p className="mt-1 text-muted">
          Ask something people will argue about. A live room opens the moment
          you post it.
        </p>
        <div className="glass mt-8 p-6">
          <CreatePromptForm />
        </div>
      </main>
    </>
  );
}
