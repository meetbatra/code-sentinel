"use client";

import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Header() {
    return (
        <nav className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto">
            <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-linear-to-br from-orange-500 to-red-500 rounded-lg" />
                <span className="text-xl font-bold text-gray-900">CodeSentinel</span>
            </Link>
            <div className="flex items-center gap-6">
                <Button variant="ghost" className="text-gray-700 hover:text-gray-900">
                    Pricing
                </Button>
                <Button variant="ghost" className="text-gray-700 hover:text-gray-900">
                    Enterprise
                </Button>

                <SignedOut>
                    <SignInButton mode="modal">
                        <Button className="bg-lime-300 text-gray-900 hover:bg-lime-400 rounded-full px-6">
                            Sign In
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


