import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Matches http(s):// URLs and bare www. links (covers pasted Instagram/TikTok/etc.).
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
// Trailing punctuation that shouldn't be swallowed into the link.
const TRAILING = /[.,!?;:)\]}'"]+$/;

/**
 * Render message text with any URLs turned into clickable links. Links open in a
 * new tab, stop propagation (so tapping a link doesn't trigger the bubble's
 * swipe-to-reply), and break-all so a long URL can't blow out the layout width.
 */
export function Linkify({ text, isOwn }: { text: string; isOwn?: boolean }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(URL_RE);
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    let url = m[0];
    let trailing = "";
    const t = url.match(TRAILING);
    if (t) {
      trailing = t[0];
      url = url.slice(0, -trailing.length);
    }
    if (start > last) nodes.push(text.slice(last, start));
    const href = url.startsWith("http") ? url : `https://${url}`;
    nodes.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className={cn("underline underline-offset-2 break-all", isOwn ? "text-white" : "text-secondary")}
      >
        {url}
      </a>
    );
    if (trailing) nodes.push(trailing);
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return <span className="whitespace-pre-wrap break-words">{nodes}</span>;
}
