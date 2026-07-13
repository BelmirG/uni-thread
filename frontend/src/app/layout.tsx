import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
import BodyChrome from "@/components/BodyChrome";
import NavTracker from "@/components/NavTracker";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniConnect",
  description: "Campus social network for IUS students",
};

// viewportFit: "cover" lets the page use the full screen on notched phones and
// makes env(safe-area-inset-*) report real values, which the nav bar and chat
// composers use to stay clear of the iPhone home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      <body className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
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
