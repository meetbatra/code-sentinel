"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, useUser, UserButton } from "@clerk/nextjs";

export function Navbar() {
    const { isSignedIn } = useUser();
    const pathname = usePathname();
    const isOnDashboard = pathname === "/dashboard";
    const isOnIntegrations = pathname === "/dashboard/integrations";

    return (
        <nav className="fixed top-0 w-full z-50 flex items-center justify-between px-6 h-12 bg-[#0a0e1a] shadow-[0_4px_0px_0px_rgba(202,253,0,1)]">
            {/* Logo */}
            <Link
                href="/"
                className="text-lg font-black italic text-[#cafd00] uppercase tracking-tight font-headline"
            >
                CodeSentinel
            </Link>

            {/* Right side */}
            <div className="flex items-center gap-3">
                {!isSignedIn ? (
                    <SignInButton mode="modal">
                        <button className="h-7 px-4 bg-[#cafd00] text-[#4a5e00] font-headline font-black text-xs uppercase shadow-[3px_3px_0px_0px_rgba(146,76,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-0 cursor-pointer">
                            Sign In
                        </button>
                    </SignInButton>
                ) : (
                    <>
                        {!isOnIntegrations && (
                            <Link
                                href="/dashboard/integrations"
                                className="h-7 px-4 inline-flex items-center bg-[#1a1f2f] text-[#cafd00] border-2 border-[#cafd00] font-headline font-black text-xs uppercase shadow-[3px_3px_0px_0px_rgba(202,253,0,0.4)] hover:bg-[#cafd00] hover:text-[#4a5e00] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-0 tracking-widest"
                            >
                                Integrations
                            </Link>
                        )}

                        {isOnDashboard ? (
                            <Link
                                href="/"
                                className="h-7 px-4 inline-flex items-center bg-[#cafd00] text-[#4a5e00] font-headline font-black text-xs uppercase shadow-[3px_3px_0px_0px_rgba(146,76,0,1)] hover:bg-[#f3ffca] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-0"
                            >
                                New Mission +
                            </Link>
                        ) : (
                            <Link
                                href="/dashboard"
                                className="h-7 px-4 inline-flex items-center bg-[#1a1f2f] text-[#cafd00] border-2 border-[#cafd00] font-headline font-black text-xs uppercase shadow-[3px_3px_0px_0px_rgba(202,253,0,0.4)] hover:bg-[#cafd00] hover:text-[#4a5e00] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all duration-0 tracking-widest"
                            >
                                Dashboard
                            </Link>
                        )}

                        <UserButton
                            appearance={{
                                variables: {
                                    colorBackground: "#0e1320",
                                    colorInputBackground: "#0a0e1a",
                                    colorInputText: "#e2e4f6",
                                    colorText: "#e2e4f6",
                                    colorTextSecondary: "#a7aabb",
                                    colorNeutral: "#e2e4f6",
                                    colorPrimary: "#cafd00",
                                    colorShimmer: "#1a1f2f",
                                    colorDanger: "#ff7351",
                                    fontFamily: "'Space Grotesk', sans-serif",
                                    fontSize: "13px",
                                    borderRadius: "0px",
                                },
                                elements: {
                                    avatarBox: "w-7 h-7 border-2 border-[#cafd00] rounded-none",
                                    userButtonPopoverRootBox: "z-[200]",
                                    userButtonPopoverCard: "!bg-[#0e1320] border-4 border-[#cafd00] shadow-[6px_6px_0px_0px_rgba(202,253,0,0.3)] rounded-none",
                                    userButtonPopoverMain: "!bg-[#0e1320]",
                                    userPreview: "!bg-[#0e1320]",
                                    userPreviewMainIdentifier: "!text-[#cafd00] font-black uppercase tracking-widest",
                                    userPreviewSecondaryIdentifier: "!text-[#a7aabb] font-mono text-xs",
                                    userPreviewTextContainer: "!bg-[#0e1320]",
                                    userButtonPopoverActions: "!bg-[#0a0e1a] border-t-2 border-[#1a1f2f]",
                                    userButtonPopoverActionButton: "!text-[#e2e4f6] hover:!bg-[#1a1f2f] hover:!text-[#cafd00] rounded-none uppercase tracking-wider text-xs font-bold",
                                    userButtonPopoverActionButtonText: "!text-[#e2e4f6] uppercase tracking-wider text-xs font-bold",
                                    userButtonPopoverActionButtonIcon: "!text-[#a7aabb]",
                                    userButtonPopoverFooter: "hidden",
                                    userButtonPopoverCustomItemButton: "!text-[#e2e4f6] hover:!bg-[#1a1f2f]",
                                },
                            }}
                        />
                    </>
                )}
            </div>
        </nav>
    );
}
