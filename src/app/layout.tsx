import type { Metadata } from "next";
import { Space_Grotesk, Inter, VT323 } from "next/font/google";
import { TRPCReactProvider } from "@/trpc/client";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
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
              <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
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
                className={`${spaceGrotesk.variable} ${inter.variable} ${vt323.variable} antialiased`}
            >
              {children}
              <Toaster />
            </body>
          </html>
        </TRPCReactProvider>
      </ClerkProvider>
  );
}
