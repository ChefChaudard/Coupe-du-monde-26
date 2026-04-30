import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Topbar from "@/app/components/Topbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appTitle = process.env.VERCEL_ENV ? "Pronos WC26" : "Pronos WC26 (Local)";

export const metadata: Metadata = {
  title: {
    default: appTitle,
    template: `%s | ${appTitle}`,
  },
  description: "Site de pronostics Coupe du Monde 2026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <Topbar />
        </Suspense>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
