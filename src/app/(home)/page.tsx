"use client";

import { useState, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Loader2, Search, X, GitBranch } from "lucide-react";
import { Navbar } from "@/components/navbar";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function Page() {
    const trpc = useTRPC();
    const router = useRouter();
    const { isSignedIn } = useUser();

    const [selectedRepo, setSelectedRepo] = useState<string>("");
    const [bugDescription, setBugDescription] = useState("");
    const [testingMode, setTestingMode] = useState<"fast" | "deep">("fast");
    const [testingScope, setTestingScope] = useState<"auto" | "backend-only" | "full-stack">("auto");

    const [repoModalOpen, setRepoModalOpen] = useState(false);
    const [repoSearch, setRepoSearch] = useState("");

    // Lock body scroll when repo modal is open
    useEffect(() => {
        document.body.style.overflow = repoModalOpen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [repoModalOpen]);

    // Fetch user's GitHub repositories
    const { data: repos, isLoading: isLoadingRepos } = useQuery(
        trpc.github.getRepositories.queryOptions(undefined, {
            enabled: isSignedIn,
        })
    );

    const filteredRepos = repos?.filter((r) =>
        r.fullName.toLowerCase().includes(repoSearch.toLowerCase())
    );

    const invokeTestAgent = useMutation(
        trpc.testAgent.run.mutationOptions({
            onSuccess: (data) => {
                toast.success("Test agent started!");
                router.push(`/test/${data.jobId}?from=home`);
            },
            onError: (err) => {
                toast.error(err.message ?? "Failed to start test agent");
            },
        })
    );

    const handleRun = () => {
        if (!selectedRepo || !bugDescription) {
            toast.error("Please select a repository and describe the bug");
            return;
        }

        const repo = repos?.find((r) => r.fullName === selectedRepo);
        if (!repo) {
            toast.error("Repository not found");
            return;
        }

        invokeTestAgent.mutate({
            repoOwner: repo.owner,
            repoName: repo.name,
            repoUrl: repo.cloneUrl,
            bugDescription,
            testingMode,
            testingScope,
        });
    };

    const scopeLabels: Record<string, string> = {
        "auto": "Auto",
        "backend-only": "API",
        "full-stack": "Full-stack",
    };

    return (
        <div className="bg-[#0a0e1a] text-[#e2e4f6] font-body selection:bg-[#cafd00] selection:text-[#4a5e00] min-h-screen">

            {/* ── Repo Picker Modal ─────────────────────────────────────────── */}
            {repoModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    onClick={() => setRepoModalOpen(false)}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-[#000000]/80 backdrop-blur-sm" />

                    {/* Panel */}
                    <div
                        className="relative z-10 w-full max-w-xl bg-[#0e1320] border-4 border-[#f3ffca] shadow-[8px_8px_0px_0px_rgba(202,253,0,0.3)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-[#1a1f2f]">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-[#f3ffca]">terminal</span>
                                <span className="font-headline font-black text-sm uppercase tracking-widest text-[#f3ffca]">
                                    Select Target Repository
                                </span>
                            </div>
                            <button
                                onClick={() => setRepoModalOpen(false)}
                                className="text-[#717584] hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="px-6 py-4 border-b-4 border-[#1a1f2f]">
                            <div className="flex items-center gap-3 bg-[#000000] border-2 border-[#444756] focus-within:border-[#f3ffca] px-3 py-2 transition-all">
                                <Search className="w-4 h-4 text-[#717584] shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Search repositories..."
                                    value={repoSearch}
                                    onChange={(e) => setRepoSearch(e.target.value)}
                                    autoFocus
                                    className="bg-transparent outline-none text-sm text-[#e2e4f6] placeholder:text-[#444756] w-full font-mono"
                                />
                            </div>
                        </div>

                        {/* Repo list */}
                        <div className="max-h-72 overflow-y-auto">
                            {!isSignedIn ? (
                                <div className="px-6 py-8 text-center text-[#717584] text-sm font-mono">
                                    Sign in to access your repositories
                                </div>
                            ) : isLoadingRepos ? (
                                <div className="px-6 py-8 flex items-center justify-center gap-3 text-[#717584] text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span className="font-mono">Fetching repositories...</span>
                                </div>
                            ) : !filteredRepos?.length ? (
                                <div className="px-6 py-8 text-center text-[#717584] text-sm font-mono">
                                    No repositories found
                                </div>
                            ) : (
                                filteredRepos.map((repo) => (
                                    <button
                                        key={repo.id}
                                        onClick={() => { setSelectedRepo(repo.fullName); setRepoModalOpen(false); setRepoSearch(""); }}
                                        className={`w-full flex items-center gap-4 px-6 py-4 text-left border-b border-[#1a1f2f] last:border-0 transition-colors ${
                                            selectedRepo === repo.fullName
                                                ? "bg-[#f3ffca]/10 text-[#f3ffca]"
                                                : "hover:bg-[#1a1f2f] text-[#e2e4f6]"
                                        }`}
                                    >
                                        <GitBranch className="w-4 h-4 text-[#717584] shrink-0" />
                                        <div className="min-w-0">
                                            <div className="font-mono text-sm truncate">{repo.fullName}</div>
                                        </div>
                                        {selectedRepo === repo.fullName && (
                                            <span className="material-symbols-outlined text-sm text-[#f3ffca] ml-auto">check</span>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Footer hint */}
                        <div className="px-6 py-3 border-t-4 border-[#1a1f2f] bg-[#141928] flex items-center justify-between">
                            <span className="text-[10px] text-[#444756] font-mono uppercase tracking-widest">
                                {repos?.length ?? 0} repositories
                            </span>
                            <span className="text-[10px] text-[#444756] font-mono uppercase tracking-widest">
                                ESC to close
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Shared TopNavBar */}
            <Navbar />

            <main>
                {/* Hero Section — fills exactly one viewport frame below the navbar */}
                <section className="relative h-[100dvh] flex flex-col justify-center px-6 arcade-grid overflow-hidden" style={{paddingTop: '48px'}}>
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0e1a] pointer-events-none"></div>
                    <div className="relative z-10 w-full max-w-5xl mx-auto text-center space-y-6">
                        <h1 className="font-arcade text-5xl md:text-8xl text-[#f3ffca] leading-none tracking-tighter drop-shadow-[0_0_15px_rgba(202,253,0,0.4)]">
                            HUNT BUGS BEFORE<br/>THEY HUNT YOU
                        </h1>
                        <div className="relative max-w-3xl mx-auto space-y-3 pb-10 pr-10">
                            {/* Repo Picker Trigger */}
                            <div className="flex justify-start">
                                <button
                                    onClick={() => isSignedIn && setRepoModalOpen(true)}
                                    disabled={!isSignedIn || isLoadingRepos}
                                    className="bg-[#1a1f2f] flex items-center gap-3 border-l-4 border-[#f3ffca] px-4 py-2 hover:bg-[#252c42] transition-colors disabled:cursor-not-allowed group"
                                >
                                    <span className="material-symbols-outlined text-[#f3ffca]">terminal</span>
                                    <span className="font-headline font-bold text-sm tracking-widest text-[#f3ffca] uppercase">
                                        {selectedRepo ? selectedRepo : (!isSignedIn ? "Sign in via GitHub" : isLoadingRepos ? "Loading..." : "Select Target Repository")}
                                    </span>
                                    {isLoadingRepos ? (
                                        <Loader2 className="w-4 h-4 text-[#717584] animate-spin" />
                                    ) : (
                                        <span className="material-symbols-outlined text-[#717584]">expand_more</span>
                                    )}
                                </button>
                            </div>

                            {/* Textarea */}
                            <div className="relative group">
                                <textarea 
                                    className="w-full h-40 bg-[#000000] border-4 border-[#444756] focus:border-[#f3ffca] p-4 text-base font-mono text-[#a7aabb] focus:text-[#f3ffca] transition-all duration-0 outline-none shadow-[8px_8px_0px_0px_rgba(26,31,47,1)] focus:shadow-[8px_8px_0px_0px_rgba(202,253,0,0.3)] resize-none pb-16" 
                                    placeholder="Example: Our login button decided to take a vacation. It clicks, but nothing happens. Find it and bring it back?"
                                    value={bugDescription}
                                    onChange={(e) => setBugDescription(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            if (!invokeTestAgent.isPending && selectedRepo && bugDescription && isSignedIn) {
                                                handleRun();
                                            }
                                        }
                                    }}
                                ></textarea>
                                
                                <div className="absolute bottom-6 left-6 flex flex-wrap gap-3">
                                    <Select
                                        value={testingMode}
                                        onValueChange={(value: "fast" | "deep") => setTestingMode(value)}
                                    >
                                        <SelectTrigger className="h-auto min-w-[11rem] rounded-none border-2 border-[#444756] bg-[#1a1f2f] px-3 py-1 text-left text-xs font-headline font-bold text-[#a7aabb] shadow-none hover:border-[#f3ffca] hover:text-[#f3ffca] focus-visible:border-[#f3ffca] focus-visible:ring-0 [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                                            <SelectValue aria-label={testingMode}>
                                                <span className="uppercase tracking-widest">{testingMode}</span>
                                                <span className="text-[10px] text-[#717584]">- speed</span>
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent
                                            position="popper"
                                            align="start"
                                            viewportClassName="py-0"
                                            className="w-44 rounded-none border-4 border-[#f3ffca] bg-[#202537] p-0"
                                        >
                                            {(["fast", "deep"] as const).map((mode) => (
                                                <SelectItem
                                                    key={mode}
                                                    value={mode}
                                                    className="rounded-none px-3 py-2 text-xs font-headline font-black uppercase tracking-widest text-white focus:bg-[#f3ffca] focus:text-black data-[state=checked]:bg-[#f3ffca] data-[state=checked]:text-black"
                                                >
                                                    {mode}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <Select
                                        value={testingScope}
                                        onValueChange={(value: "auto" | "backend-only" | "full-stack") => setTestingScope(value)}
                                    >
                                        <SelectTrigger className="h-auto min-w-[11rem] rounded-none border-2 border-[#444756] bg-[#1a1f2f] px-3 py-1 text-left text-xs font-headline font-bold text-[#a7aabb] shadow-none hover:border-[#f3ffca] hover:text-[#f3ffca] focus-visible:border-[#f3ffca] focus-visible:ring-0 [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                                            <SelectValue aria-label={testingScope}>
                                                <span className="uppercase tracking-widest">{scopeLabels[testingScope]}</span>
                                                <span className="text-[10px] text-[#717584]">- scope</span>
                                            </SelectValue>
                                        </SelectTrigger>
                                        <SelectContent
                                            position="popper"
                                            align="start"
                                            viewportClassName="py-0"
                                            className="w-44 rounded-none border-4 border-[#f3ffca] bg-[#202537] p-0"
                                        >
                                            {([
                                                { value: "auto", label: "Auto" },
                                                { value: "backend-only", label: "API" },
                                                { value: "full-stack", label: "Full-stack" },
                                            ] as const).map(({ value, label }) => (
                                                <SelectItem
                                                    key={value}
                                                    value={value}
                                                    className="rounded-none px-3 py-2 text-xs font-headline font-black uppercase tracking-widest text-white focus:bg-[#f3ffca] focus:text-black data-[state=checked]:bg-[#f3ffca] data-[state=checked]:text-black"
                                                >
                                                    {label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Circular START TEST button — overhangs outside textarea corner */}
                                <button 
                                    onClick={handleRun}
                                    disabled={invokeTestAgent.isPending || !selectedRepo || !bugDescription || !isSignedIn}
                                    className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full bg-[#cafd00] text-[#4a5e00] shadow-[5px_5px_0px_0px_rgba(146,76,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-0 flex items-center justify-center hover:scale-110 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                                >
                                    {invokeTestAgent.isPending ? (
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                    ) : (
                                        <span className="material-symbols-outlined text-3xl font-black">arrow_forward</span>
                                    )}
                                    <span className="absolute -top-3 -left-3 bg-[#fc8700] text-white text-[8px] font-black px-1.5 py-0.5 rotate-[-12deg] tracking-tighter pointer-events-none">
                                        START TEST
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                    {/* Decorative Bits */}
                    <div className="absolute bottom-20 left-10 hidden lg:block opacity-20">
                        <pre className="font-arcade text-[#f3ffca] text-xs leading-none">
01010111 01000001 01010100 01000011 01001000 
01000100 01001111 01000111 00100000 01000001 
01000011 01010100 01001001 01010110 01000101
                        </pre>
                    </div>
                </section>


                {/* How the Magic Happens Section */}
                <section className="py-32 px-6 bg-[#0e1320] border-y-4 border-[#1a1f2f]">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-24 text-center md:text-left">
                            <h2 className="font-arcade text-6xl text-white uppercase mb-4 tracking-tighter">How the Magic Happens</h2>
                            <div className="w-32 h-4 bg-[#fc8700]"></div>
                        </div>
                        <div className="relative">
                            <div className="absolute inset-0 z-0 pointer-events-none hidden lg:block">
                                <svg className="w-full h-full" fill="none" viewBox="0 0 1200 400">
                                    <path d="M50 50 L350 150 L650 50 L950 150" opacity="0.4" stroke="#ccff00" strokeDasharray="24 24" strokeWidth="8"></path>
                                </svg>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
                                {/* Step 1 */}
                                <div className="group">
                                    <div className="relative mb-8">
                                        <div className="w-24 h-24 bg-[#1a1f2f] border-4 border-[#444756] flex items-center justify-center group-hover:border-[#ccff00] transition-all steps-4">
                                            <span className="material-symbols-outlined text-5xl text-[#ccff00] group-hover:scale-110 transition-transform">rocket_launch</span>
                                        </div>
                                        <div className="absolute -top-4 -right-4 bg-[#ccff00] text-black px-3 py-1 font-arcade text-2xl chunky-shadow-primary">01</div>
                                    </div>
                                    <h3 className="font-arcade text-2xl text-white mb-4 uppercase">Insert Coin</h3>
                                    <p className="text-[#a7aabb] leading-relaxed text-sm">Drop your GitHub link and vent about the bug. We immediately spawn a hardcore, isolated E2B sandbox—like a secure boss arena for your code.</p>
                                </div>
                                {/* Step 2 */}
                                <div className="group mt-0 lg:mt-24">
                                    <div className="relative mb-8">
                                        <div className="w-24 h-24 bg-[#1a1f2f] border-4 border-[#444756] flex items-center justify-center group-hover:border-[#ccff00] transition-all steps-4">
                                            <span className="material-symbols-outlined text-5xl text-[#ccff00] group-hover:scale-110 transition-transform">dns</span>
                                        </div>
                                        <div className="absolute -top-4 -right-4 bg-[#ccff00] text-black px-3 py-1 font-arcade text-2xl chunky-shadow-primary">02</div>
                                    </div>
                                    <h3 className="font-arcade text-2xl text-white mb-4 uppercase">Spawn Area</h3>
                                    <p className="text-[#a7aabb] leading-relaxed text-sm">Your repo teleports in. We quietly boot up local servers, juggle your env vars, and unleash headless browsers roaming in the background.</p>
                                </div>
                                {/* Step 3 */}
                                <div className="group">
                                    <div className="relative mb-8">
                                        <div className="w-24 h-24 bg-[#1a1f2f] border-4 border-[#444756] flex items-center justify-center group-hover:border-[#ccff00] transition-all steps-4">
                                            <span className="material-symbols-outlined text-5xl text-[#ccff00] group-hover:scale-110 transition-transform">smart_toy</span>
                                        </div>
                                        <div className="absolute -top-4 -right-4 bg-[#ccff00] text-black px-3 py-1 font-arcade text-2xl chunky-shadow-primary">03</div>
                                    </div>
                                    <h3 className="font-arcade text-2xl text-white mb-4 uppercase">Boss Fight</h3>
                                    <p className="text-[#a7aabb] leading-relaxed text-sm">Our hyper-caffeinated AI agent equips its weapons. It starts executing bash commands, ripping through Playwright tests, and taking literal screenshots of UI fails.</p>
                                </div>
                                {/* Step 4 */}
                                <div className="group mt-0 lg:mt-24">
                                    <div className="relative mb-8">
                                        <div className="w-24 h-24 bg-[#1a1f2f] border-4 border-[#444756] flex items-center justify-center group-hover:border-[#ccff00] transition-all steps-4">
                                            <span className="material-symbols-outlined text-5xl text-[#ccff00] group-hover:scale-110 transition-transform">dashboard</span>
                                        </div>
                                        <div className="absolute -top-4 -right-4 bg-[#ccff00] text-black px-3 py-1 font-arcade text-2xl chunky-shadow-primary">04</div>
                                    </div>
                                    <h3 className="font-arcade text-2xl text-white mb-4 uppercase">High Score</h3>
                                    <p className="text-[#a7aabb] leading-relaxed text-sm">Smoke clears. You get a glorious dashboard report pointing out exactly which line of code sold your game—plus the cheat codes (patches) to fix it.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

            </main>

            {/* Footer */}
            <footer className="w-full border-t-4 border-[#1a1f2f] bg-[#000000] flex flex-col md:flex-row justify-between items-center px-8 py-12 gap-6">
                <div className="flex items-center gap-4">
                    <span className="text-[#ccff00] font-black text-xl font-['Space_Grotesk'] uppercase tracking-tight">CodeSentinel</span>
                    <span className="text-gray-500 font-['Space_Grotesk'] uppercase text-xs tracking-widest justify-center sm:justify-start">© 2026 CODESENTINEL. INSERT COIN TO CONTINUE.</span>
                </div>
                <div className="flex gap-8">
                    <Link className="text-gray-500 font-['Space_Grotesk'] uppercase text-xs tracking-widest hover:text-white transition-colors duration-75" href="#">Privacy</Link>
                    <Link className="text-gray-500 font-['Space_Grotesk'] uppercase text-xs tracking-widest hover:text-white transition-colors duration-75" href="#">Terms</Link>
                    <Link className="text-gray-500 font-['Space_Grotesk'] uppercase text-xs tracking-widest hover:text-white transition-colors duration-75" href="#">Security</Link>
                    <Link className="text-[#ccff00] font-['Space_Grotesk'] uppercase text-xs tracking-widest hover:text-white transition-colors duration-75" href="#">Status</Link>
                </div>
            </footer>
        </div>
    );
}
