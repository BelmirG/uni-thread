import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import BodyChrome from "@/components/BodyChrome";
import NavTracker from "@/components/NavTracker";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniConnect",
  description: "Campus social network for IUS students",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="pb-24">
        <ToastProvider>
          <BodyChrome />
          <NavTracker />
          {children}
          <NavBar />
        </ToastProvider>
      </body>
    </html>
  );
}
