import { clsx } from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

/** Matches PromptCard's fixed box height so the grid doesn't jump. */
export function CardSkeleton() {
  return (
    <div className="glass flex h-[258px] flex-col p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-6 w-4/5" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-2/3" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="ml-auto h-4 w-20" />
      </div>
    </div>
  );
}
