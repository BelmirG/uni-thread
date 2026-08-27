import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TOKEN_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)|(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_]{3,50})/gi;
const TRAILING = /[.,!?;:)\]}'"]+$/;

export function Linkify({ text, isOwn }: { text: string; isOwn?: boolean }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(TOKEN_RE);
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    if (start > last) nodes.push(text.slice(last, start));

    if (m[3] !== undefined) {
      if (m[2]) nodes.push(m[2]);
      nodes.push(
        <Link
          key={key++}
          href={`/profile/${m[3]}`}
          onClick={(e) => e.stopPropagation()}
          className={cn("font-semibold no-underline", isOwn ? "text-white underline underline-offset-2" : "text-secondary")}
        >
          @{m[3]}
        </Link>
      );
    } else {
      let url = m[0];
      let trailing = "";
      const t = url.match(TRAILING);
      if (t) {
        trailing = t[0];
        url = url.slice(0, -trailing.length);
      }
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
    }
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return <span className="whitespace-pre-wrap break-words">{nodes}</span>;
}
