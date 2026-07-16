"use client";

import { cn } from "@/lib/utils";

/** Grey pulse block — building block for the skeleton layouts below. */
function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-container-high", className)} />;
}

/** Placeholder post cards shown while a feed/Q&A list loads. */
export function SkeletonPostList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface rounded-2xl shadow-sm px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Block className="w-9 h-9 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Block className="h-3 w-28" />
              <Block className="h-2.5 w-16" />
            </div>
          </div>
          <div className="space-y-2">
            <Block className="h-3 w-full" />
            <Block className="h-3 w-4/5" />
            <Block className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder for the profile header card + post list while a profile loads. */
export function SkeletonProfile() {
  return (
    <div aria-hidden="true">
      <div className="bg-surface rounded-2xl shadow-sm p-4 mb-4">
        <div className="flex items-start gap-4">
          <Block className="w-[72px] h-[72px] rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1.5">
            <Block className="h-4 w-36" />
            <Block className="h-3 w-24" />
            <Block className="h-3 w-full max-w-[240px]" />
          </div>
        </div>
        <div className="flex gap-6 mt-4">
          <Block className="h-3 w-14" />
          <Block className="h-3 w-14" />
          <Block className="h-3 w-14" />
        </div>
      </div>
      <SkeletonPostList count={2} />
    </div>
  );
}

/** Placeholder rows shown while a conversation or club list loads. */
export function SkeletonRowList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm bg-surface"
        >
          <Block className="w-[42px] h-[42px] rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Block className="h-3 w-32" />
            <Block className="h-2.5 w-48 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
