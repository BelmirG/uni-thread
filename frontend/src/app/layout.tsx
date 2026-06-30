import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "IUSConnect",
  description: "Campus social network for IUS students",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="pb-16">
        <ToastProvider>
          {children}
          <NavBar />
        </ToastProvider>
      </body>
    </html>
  );
}
