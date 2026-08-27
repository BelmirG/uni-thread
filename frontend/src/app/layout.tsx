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
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.theme==="dark"){document.documentElement.classList.add("dark");' +
              'var m=document.querySelector(\'meta[name="theme-color"]\');if(m)m.setAttribute("content","#111112");}}catch(e){}',
          }}
        />
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
