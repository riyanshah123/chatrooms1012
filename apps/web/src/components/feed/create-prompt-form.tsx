"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiRequestError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import type { FeedPromptCard } from "./prompt-feed";

interface CategoryChip {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

/**
 * Create-prompt form: title · category · description · tags (chips) ·
 * max users (slider 2–10) · visibility. On success the API has already
 * created the room with the creator seated, so we jump straight in.
 */
export function CreatePromptForm() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [maxUsers, setMaxUsers] = useState(10);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");

  // Auth gate: creating requires a logged-in, onboarded user.
  useEffect(() => {
    if (status === "anonymous") {
      sessionStorage.setItem("cr-return-to", "/create");
      router.replace("/login");
    }
  }, [status, router]);

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<{ items: CategoryChip[] }>("/categories"),
    staleTime: 300_000,
  });

  const create = useMutation({
    mutationFn: () =>
      api<FeedPromptCard>("/prompts", {
        method: "POST",
        body: {
          title,
          categoryId,
          description: description || undefined,
          tags,
          maxUsers,
          visibility,
        },
      }),
    onSuccess: (prompt) => {
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      router.push(`/room/${prompt.chatroomId}`);
    },
  });

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase().replace(/\s+/g, "-");
    if (t.length >= 2 && tags.length < 5 && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagDraft("");
  };

  const errorMessage =
    create.error instanceof ApiRequestError
      ? create.error.message
      : create.error
        ? "Something went wrong — try again."
        : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
          The prompt
        </label>
        <input
          id="title"
          required
          minLength={8}
          maxLength={200}
          placeholder="Harry Potter vs Percy Jackson — who wins?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">Category</label>
        <div className="flex flex-wrap gap-2">
          {(categories.data?.items ?? []).map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className={`chip ${categoryId === c.id ? "chip-active" : ""}`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="desc" className="mb-1.5 block text-sm font-medium">
          Description <span className="text-muted">(optional)</span>
        </label>
        <textarea
          id="desc"
          maxLength={1000}
          rows={3}
          placeholder="Frame the debate, set the rules…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input resize-none"
        />
      </div>

      <div>
        <label htmlFor="tags" className="mb-1.5 block text-sm font-medium">
          Tags <span className="text-muted">(up to 5)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span key={t} className="chip chip-active">
              #{t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => setTags(tags.filter((x) => x !== t))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {tags.length < 5 && (
            <input
              id="tags"
              value={tagDraft}
              placeholder="add tag ⏎"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              className="input w-36"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="max" className="mb-1.5 block text-sm font-medium">
            Room size: <span className="text-accent">{maxUsers}</span>
          </label>
          <input
            id="max"
            type="range"
            min={2}
            max={10}
            value={maxUsers}
            onChange={(e) => setMaxUsers(Number(e.target.value))}
            className="w-full accent-[rgb(var(--accent))]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Visibility</label>
          <div className="flex gap-2">
            {(["PUBLIC", "PRIVATE"] as const).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setVisibility(v)}
                className={`chip ${visibility === v ? "chip-active" : ""}`}
              >
                {v === "PUBLIC" ? "🌐 Public" : "🔒 Private (link only)"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}

      <button
        type="submit"
        disabled={create.isPending || !title || !categoryId}
        className="btn-primary w-full"
      >
        {create.isPending ? (
          <Spinner className="size-4 border-accent-ink/40 border-t-accent-ink" />
        ) : null}
        Open the room
      </button>
    </form>
  );
}
