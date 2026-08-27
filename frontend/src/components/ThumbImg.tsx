"use client";

import { thumbUrl } from "@/lib/thumb";

export default function ThumbImg({
  src,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  return (
    <img
      {...rest}
      src={thumbUrl(src)}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.src.endsWith("_t.webp")) el.src = src;
      }}
    />
  );
}
