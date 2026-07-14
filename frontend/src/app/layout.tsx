import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
import BodyChrome from "@/components/BodyChrome";
import PullToRefresh from "@/components/PullToRefresh";
import NavTracker from "@/components/NavTracker";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniThread",
  description: "Campus social network for IUS students",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "UniThread",
    // "default" keeps the iOS status bar opaque so page headers never end up
    // underneath the clock when the app runs from the home screen.
    statusBarStyle: "default",
  },
};

// viewportFit: "cover" lets the page use the full screen on notched phones and
// makes env(safe-area-inset-*) report real values, which the nav bar and chat
// composers use to stay clear of the iPhone home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale + userScalable stop iOS's automatic zoom-in when focusing a
  // text input (font-size < 16px triggers it). Without this the home-screen
  // app ends up permanently zoomed in after composing a post, forcing users
  // to pinch out to see the whole page. iOS still honors pinch-zoom for
  // accessibility regardless of these flags.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
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
          <PullToRefresh />
          <NavTracker />
          {children}
          <NavBar />
        </ToastProvider>
      </body>
    </html>
  );
}
