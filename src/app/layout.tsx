import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TRPCReactProvider } from "@/trpc/client";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeSentinel - Autonomous Bug Testing",
  description: "AI-powered autonomous bug testing that analyzes your codebase, sets up environments, writes tests, and confirms bugs exist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <ClerkProvider>
        <TRPCReactProvider>
          <html lang="en" suppressHydrationWarning>
            <head>
              <script
                dangerouslySetInnerHTML={{
                  __html: `
                    try {
                      const theme = localStorage.getItem('theme') || 
                        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                      document.documentElement.classList.toggle('dark', theme === 'dark');
                    } catch (e) {}
                  `,
                }}
              />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
              {children}
              <Toaster />
            </body>
          </html>
        </TRPCReactProvider>
      </ClerkProvider>
  );
}
