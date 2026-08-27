"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, MessageCircle, ChevronUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import MiniAvatar from "@/components/MiniAvatar";
import { ImageGrid } from "@/components/ImageGrid";
import { SkeletonPostList } from "@/components/Skeleton";
import { Linkify } from "@/lib/linkify";
import { timeAgo } from "@/lib/timeAgo";

interface Author {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface SavedPost {
  id: string;
  content: string;
  post_type: string;
  image_urls: string[];
  author: Author | null;
  upvotes: number;
  reply_count: number;
  created_at: string;
  edited_at: string | null;
}

interface SavedResponse {
  posts: SavedPost[];
  total: number;
}

function postHref(p: SavedPost): string {
  return p.post_type === "anonymous_qa" ? `/qa/${p.id}` : `/feed/${p.id}`;
}

export default function SavedPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<SavedResponse>("/api/posts/saved")
      .then((data) => setPosts(data.posts))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function unsave(postId: string) {
    // Optimistic removal; restore on failure.
    const prev = posts;
    setPosts((p) => p.filter((x) => x.id !== postId));
    try {
      await apiFetch(`/api/posts/${postId}/bookmark`, { method: "POST" });
    } catch {
      setPosts(prev);
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 pt-4 pb-8 page-enter">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold tracking-tight text-on-surface">Saved posts</h1>
      </div>

      {loading && <SkeletonPostList />}

      {!loading && posts.length === 0 && (
        <div className="text-center py-16">
          <Bookmark className="w-8 h-8 mx-auto text-on-surface-variant/40 mb-3" />
          <p className="text-sm text-on-surface-variant">
            Nothing saved yet. Tap the bookmark on any post to keep it here.
          </p>
        </div>
      )}

      <div className="space-y-3 stagger-children">
        {posts.map((post) => (
          <div key={post.id} className="bg-surface rounded-2xl shadow-sm overflow-hidden">
            <Link href={postHref(post)} className="block no-underline">
              <div className="flex items-start gap-3 px-4 pt-4 pb-1">
                <MiniAvatar
                  name={post.author?.username ?? "Anonymous"}
                  url={post.author?.avatar_url ?? null}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm text-on-surface leading-tight">
                    {post.author?.username ?? "Anonymous"}
                  </span>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    {timeAgo(post.created_at)}
                    {post.edited_at && <span className="italic"> · edited</span>}
                    {post.post_type === "anonymous_qa" && <span> · Anonymous</span>}
                  </p>
                </div>
              </div>
              {post.content && (
                <p className="px-4 py-2 text-sm leading-relaxed text-on-surface line-clamp-4">
                  <Linkify text={post.content} />
                </p>
              )}
              {(post.image_urls ?? []).length > 0 && (
                <div className="px-4 pb-2">
                  <ImageGrid urls={post.image_urls} />
                </div>
              )}
            </Link>
            <div className="flex items-center gap-3 px-4 py-2 border-t border-surface-variant text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <ChevronUp className="w-3.5 h-3.5" /> {post.upvotes}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> {post.reply_count}
              </span>
              <button
                onClick={() => unsave(post.id)}
                className="ml-auto flex items-center gap-1.5 text-secondary hover:text-on-surface transition-colors font-medium"
              >
                <Bookmark className="w-3.5 h-3.5 fill-current" />
                Saved
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
