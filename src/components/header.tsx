"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header() {
    return (
        <nav className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto">
            <Link href="/" className="flex items-center gap-2">
                <Image src="/logo.svg" alt="CodeSentinel Logo" width={32} height={32} />
                <span className="text-xl font-bold text-foreground">CodeSentinel</span>
            </Link>

            <div className="flex items-center gap-4">
                <ThemeToggle />

                <SignedOut>
                    <SignInButton mode="modal">
                        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6">
                            Sign In with GitHub
                        </Button>
                    </SignInButton>
                </SignedOut>

                <SignedIn>
                    <UserButton
                        appearance={{
                            elements: {
                                avatarBox: "w-10 h-10"
                            }
                        }}
                    />
                </SignedIn>
            </div>
        </nav>
    );
}


