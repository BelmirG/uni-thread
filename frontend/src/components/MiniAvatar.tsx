"use client";

export default function MiniAvatar({
  name,
  url,
  size = 32,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  if (url)
    return (
      <img
        src={url}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#111",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: "bold",
        flexShrink: 0,
      }}
    >
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}
