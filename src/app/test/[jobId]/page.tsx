"use client";

import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { CodeBlock } from "@/components/code-block";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, FileEdit, Sparkles, ChevronRight, Server, TerminalSquare, Maximize2, MousePointer2, Type, Navigation, Eye, Loader2, FileCode, Globe } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";

// ─── Type guards ────────────────────────────────────────────────────────────

function parseSuggestedFixes(fixes: unknown): SuggestedFix[] {
    if (!fixes || !Array.isArray(fixes)) return [];
    return fixes.filter((fix): fix is SuggestedFix =>
        typeof fix === "object" && fix !== null &&
        "type" in fix && "filePath" in fix && "updatedSnippet" in fix &&
        (fix.type === "modify" || fix.type === "new") &&
        typeof fix.filePath === "string" && typeof fix.updatedSnippet === "string"
    );
}

function parseSteps(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((s): s is string => typeof s === "string");
}

// Helper to determine icon for a step based on its content
function getStepIcon(step: string) {
    const lowerStep = step.toLowerCase();
    if (lowerStep.includes('navigate') || lowerStep.includes('goto') || lowerStep.includes('visit') || lowerStep.includes('open')) {
        return { Icon: Navigation, color: '#fc8700' };
    }
    if (lowerStep.includes('click') || lowerStep.includes('press') || lowerStep.includes('select')) {
        return { Icon: MousePointer2, color: '#cafd00' };
    }
    if (lowerStep.includes('type') || lowerStep.includes('enter') || lowerStep.includes('input') || lowerStep.includes('fill')) {
        return { Icon: Type, color: '#b024ff' };
    }
    if (lowerStep.includes('wait') || lowerStep.includes('loading') || lowerStep.includes('expect')) {
        return { Icon: Loader2, color: '#00d4ff' };
    }
    if (lowerStep.includes('verify') || lowerStep.includes('check') || lowerStep.includes('assert') || lowerStep.includes('see')) {
        return { Icon: Eye, color: '#ff7351' };
    }
    if (lowerStep.includes('api') || lowerStep.includes('request') || lowerStep.includes('fetch')) {
        return { Icon: Server, color: '#cafd00' };
    }
    if (lowerStep.includes('code') || lowerStep.includes('script')) {
        return { Icon: FileCode, color: '#b024ff' };
    }
    // Default
    return { Icon: Globe, color: '#a7aabb' };
}

function parseNetworkAssertions(value: unknown): NetworkAssertion[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is NetworkAssertion =>
        typeof item === "object" && item !== null &&
        "url" in item && "method" in item && "expectedStatus" in item &&
        "actualStatus" in item && "passed" in item
    );
}

function parseUiAssertions(value: unknown): UiAssertion[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is UiAssertion =>
        typeof item === "object" && item !== null &&
        "selector" in item && "expected" in item && "actual" in item && "passed" in item
    );
}

function isFullStackTest(test: Test): boolean {
    return test.type === "full-stack" || test.type === "FULL_STACK";
}

function formatAffectedLayer(value: string): string {
    const v = value.toUpperCase();
    if (v === "FRONTEND") return "FRONTEND";
    if (v === "BACKEND") return "BACKEND";
    if (v === "BOTH") return "BOTH";
    return value.toUpperCase();
}

// ─── Types ──────────────────────────────────────────────────────────────────

type TestStatus = "PASS" | "FAIL" | "ERROR";
type BugConfidence = "LOW" | "MEDIUM" | "HIGH";

interface NetworkAssertion { url: string; method: string; expectedStatus: number; actualStatus: number; passed: boolean; }
interface UiAssertion { selector: string; expected: string; actual: string; passed: boolean; }

interface Test {
    id: string; testFile: string; testName: string; fileContent: string;
    status: TestStatus; exitCode: number | null; output: string | null;
    executedAt: Date | null; type: string; featureName: string | null;
    screenshotUrl: string | null; steps: unknown; networkAssertions: unknown; uiAssertions: unknown;
}

interface SuggestedFix { type: "modify" | "new"; filePath: string; existingSnippet?: string; updatedSnippet: string; }

interface Bug {
    id: string; message: string; rootCause: string | null; sourceFile: string | null;
    confidence: BugConfidence; testFile: string | null; testName: string | null;
    suggestedFixes?: unknown; affectedLayer?: string | null;
}

interface DiscoveryInfo {
    framework?: string; entryPoint?: string; moduleType?: string;
    backendFramework?: string; frontendFramework?: string;
    backendEntryPoint?: string; frontendEntryPoint?: string;
    databaseUsed?: boolean;
    endpoints?: Array<{ method: string; path: string; file: string }>;
    envVarsNeeded?: string[];
}

interface ServerInfo {
    port?: number; sandboxUrl?: string; startCommand?: string; isRunning?: boolean;
    backendPort?: number; backendUrl?: string; backendStartCommand?: string; backendRunning?: boolean;
    frontendPort?: number; frontendUrl?: string; frontendStartCommand?: string; frontendRunning?: boolean;
}

// ─── Terminal Summary Component ────────────────────────────────────────────

function TerminalSummaryDisplay({ summary }: { summary: string }) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isTruncated, setIsTruncated] = useState(false);
    const summaryRef = useRef<HTMLParagraphElement>(null);

    useEffect(() => {
        if (summaryRef.current) {
            // Check if content exceeds 6 lines (approx 6 * 1.5rem line-height = 9rem)
            const lineHeight = parseFloat(getComputedStyle(summaryRef.current).lineHeight);
            const maxHeight = lineHeight * 6;
            setIsTruncated(summaryRef.current.scrollHeight > maxHeight);
        }
    }, [summary]);

    // Disable body scroll when dialog is open
    useEffect(() => {
        if (isDialogOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        
        return () => {
            document.body.style.overflow = '';
        };
    }, [isDialogOpen]);

    const cleanedSummary = summary
        .replace(/<task_summary>/gi, "")
        .replace(/<\/task_summary>/gi, "")
        .replace(/\\n/g, " ")
        .trim();

    return (
        <>
            <div className="relative">
                <p
                    ref={summaryRef}
                    className={`text-[#a7aabb] text-sm leading-relaxed font-body ${
                        isTruncated ? "line-clamp-6" : ""
                    }`}
                >
                    {cleanedSummary}
                </p>
                {isTruncated && (
                    <div className="mt-3 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsDialogOpen(true)}
                            className="bg-[#1a1f2f] border-[#fc8700] text-[#fc8700] hover:bg-[#fc8700] hover:text-[#141928] transition-all duration-200"
                        >
                            <Maximize2 className="w-3.5 h-3.5 mr-2" />
                            Show More
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] bg-[#141928] border-2 border-[#fc8700] text-[#e2e4f6] overflow-hidden flex flex-col">
                    <DialogTitle className="font-arcade text-2xl text-[#e2e4f6] uppercase tracking-wider flex items-center gap-3 border-b border-[#1a1f2f] pb-4 flex-shrink-0">
                        <TerminalSquare className="w-6 h-6 text-[#fc8700]" />
                        Complete Terminal Summary
                    </DialogTitle>
                    <div className="overflow-y-auto pr-4 custom-scrollbar flex-1 min-h-0">
                        <p className="text-[#a7aabb] text-sm leading-relaxed font-body whitespace-pre-wrap">
                            {cleanedSummary}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ─── Mission Brief Component ────────────────────────────────────────────

function MissionBriefDisplay({ bugDescription }: { bugDescription: string }) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isTruncated, setIsTruncated] = useState(false);
    const briefRef = useRef<HTMLParagraphElement>(null);

    useEffect(() => {
        if (briefRef.current) {
            // Check if content exceeds 4 lines
            const lineHeight = parseFloat(getComputedStyle(briefRef.current).lineHeight);
            const maxHeight = lineHeight * 4;
            setIsTruncated(briefRef.current.scrollHeight > maxHeight);
        }
    }, [bugDescription]);

    // Disable body scroll when dialog is open
    useEffect(() => {
        if (isDialogOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        
        return () => {
            document.body.style.overflow = '';
        };
    }, [isDialogOpen]);

    return (
        <>
            <div className="mt-4 pt-4 border-t border-[#1a1f2f]">
                <span className="text-[#717584] text-[10px] uppercase tracking-widest font-mono block mb-2">
                    Original Mission Brief:
                </span>
                <p
                    ref={briefRef}
                    className={`text-[#e2e4f6] text-xs font-mono ${
                        isTruncated ? "line-clamp-4" : ""
                    }`}
                >
                    {bugDescription}
                </p>
                {isTruncated && (
                    <div className="mt-2 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsDialogOpen(true)}
                            className="bg-[#1a1f2f] border-[#fc8700] text-[#fc8700] hover:bg-[#fc8700] hover:text-[#141928] transition-all duration-200 text-[10px]"
                        >
                            <Maximize2 className="w-3 h-3 mr-1.5" />
                            Show More
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh] bg-[#141928] border-2 border-[#fc8700] text-[#e2e4f6] overflow-hidden flex flex-col">
                    <DialogTitle className="font-arcade text-2xl text-[#e2e4f6] uppercase tracking-wider flex items-center gap-3 border-b border-[#1a1f2f] pb-4 flex-shrink-0">
                        <TerminalSquare className="w-6 h-6 text-[#fc8700]" />
                        Original Mission Brief
                    </DialogTitle>
                    <div className="overflow-y-auto pr-4 custom-scrollbar flex-1 min-h-0">
                        <p className="text-[#e2e4f6] text-sm font-mono whitespace-pre-wrap leading-relaxed">
                            {bugDescription}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TestResultsPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const jobId = params.jobId as string;
    const trpc = useTRPC();
    const from = searchParams.get("from");
    const backHref = from === "dashboard" ? "/dashboard" : "/";
    const [isOptimisticallyCancelled, setIsOptimisticallyCancelled] = useState(false);

    const cancelRun = useMutation(
        trpc.jobs.cancel.mutationOptions({
            onSuccess: (result) => {
                if (!result.success) { setIsOptimisticallyCancelled(false); toast.error(result.message ?? "Unable to cancel run"); return; }
                toast.success("Run canceled");
            },
            onError: (err) => { toast.error(err.message ?? "Failed to cancel run"); },
        })
    );

    const handleCancel = () => {
        if (cancelRun.isPending || isOptimisticallyCancelled) return;
        setIsOptimisticallyCancelled(true);
        cancelRun.mutate({ jobId }, { onError: () => setIsOptimisticallyCancelled(false) });
    };

    const { data: job, isLoading, isFetching, isError, error } = useQuery(
        trpc.jobs.getById.queryOptions({ id: jobId }, {
            refetchInterval: (query) => {
                const data = query.state.data;
                if (data?.status && ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(data.status)) return 2000;
                return false;
            },
        })
    );

    if (isOptimisticallyCancelled) return <CancelledState backHref={backHref} />;
    if (!job && (isLoading || isFetching)) return <LoadingState onBack={() => router.push(backHref)} onCancel={handleCancel} isCancelling={cancelRun.isPending} status="ANALYZING" />;
    if (isError) {
        const code = (error as { data?: { code?: string } } | undefined)?.data?.code;
        if (code === "NOT_FOUND") return <NotFoundState />;
        return <LoadingState onBack={() => router.push(backHref)} onCancel={handleCancel} isCancelling={cancelRun.isPending} status="ANALYZING" />;
    }
    if (!job) return <NotFoundState />;

    const isActive = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(job.status);
    const isCancelled = isOptimisticallyCancelled || (job.status === "FAILED" && (job.summary ?? "").toLowerCase().includes("canceled by user"));

    if (isCancelled) return <CancelledState backHref={backHref} />;
    if (isActive) return <LoadingState onBack={() => router.push(backHref)} onCancel={handleCancel} isCancelling={cancelRun.isPending} status={job.status} />;

    const discoveryInfo = (job.discoveryInfo || {}) as DiscoveryInfo;
    const serverInfo = (job.serverInfo || {}) as ServerInfo;
    const totalTests = job.totalTests ?? job.tests.length;
    const passedTests = job.passedTests ?? job.tests.filter(t => t.status === "PASS").length;
    const failedTests = (job.failedTests ?? job.tests.filter(t => t.status === "FAIL").length) + (job.errorTests ?? 0);

    return (
        <div className="min-h-screen bg-[#000000] text-white selection:bg-[#cafd00] selection:text-black">
            <Navbar />

            {/* Main Content Area */}
            <main className="pt-24 pb-32 px-4 md:px-12 lg:px-20 max-w-7xl mx-auto min-h-screen">
                
                {/* ── BENTO GRID TOP (Terminal Readout Header) ──────────────────── */}
                <div className="mb-12">
                    <button
                        onClick={() => router.push(backHref)}
                        className="flex items-center gap-2 mb-6 text-[#717584] hover:text-[#fc8700] text-xs uppercase tracking-widest font-label transition-colors group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform">←</span>
                        Back
                    </button>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                        <div className="md:col-span-8">
                            <StatusChip status={job.status} />
                            <h1 className="font-arcade text-5xl text-white uppercase leading-none break-all mt-6 shadow-sm">
                                {job.repository.repoOwner}/<span className="text-[#cafd00]">{job.repository.repoName}</span>
                            </h1>
                        </div>
                        
                        <div className="md:col-span-4 flex gap-4 md:justify-end">
                            <StatBox label="TOTAL TESTS" value={totalTests} color="primary" />
                            <StatBox label="PASSED" value={passedTests} color="green" />
                            <StatBox label="FAILED" value={failedTests} color="red" />
                        </div>
                    </div>
                </div>

                {/* ── BENTO GRID LAYOUT ───────────────────────────────────────── */}
                <div className="space-y-12">
                    
                    {/* ROW 1: Summary & Execution Variables */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                        
                        {/* Mission Summary Pane */}
                        <div className="lg:col-span-8 bg-[#141928] border-l-4 border-[#fc8700] p-6 shadow-[8px_8px_0px_0px_rgba(20,25,40,0.5)]">
                            <h2 className="font-arcade text-2xl text-[#e2e4f6] uppercase tracking-wider mb-4 flex items-center gap-3">
                                <TerminalSquare className="w-6 h-6 text-[#fc8700]"/>
                                Terminal Summary
                            </h2>
                            {job.summary ? (
                                <TerminalSummaryDisplay summary={job.summary} />
                            ) : (
                                <p className="text-[#a7aabb] text-xs leading-relaxed font-body italic">No summary generated.</p>
                            )}
                            {job.bugDescription && (
                                <MissionBriefDisplay bugDescription={job.bugDescription} />
                            )}
                        </div>

                        {/* Tech Details Box */}
                        <div className="lg:col-span-4 bg-[#0e0e0e] border border-[#1a1f2f] p-6 hover:border-[#444756] transition-colors relative group h-full">
                            {(Object.keys(discoveryInfo).length > 0 || Object.keys(serverInfo).length > 0) ? (
                                <>
                                    <div className="absolute top-0 right-0 w-8 h-8 bg-[#f3ffca]/10 group-hover:bg-[#f3ffca]/20 transition-colors flex items-center justify-center">
                                        <Server className="w-4 h-4 text-[#cafd00]" />
                                    </div>
                                    <h3 className="font-label text-xs uppercase text-[#717584] tracking-widest mb-6">Execution Variables</h3>
                                    <div className="space-y-2 text-xs font-mono">
                                        {discoveryInfo.framework && <TechRow k="Framework" v={discoveryInfo.framework} />}
                                        {discoveryInfo.backendFramework && <TechRow k="Backend" v={discoveryInfo.backendFramework} />}
                                        {discoveryInfo.frontendFramework && <TechRow k="Frontend" v={discoveryInfo.frontendFramework} />}
                                        {discoveryInfo.entryPoint && <TechRow k="Entry" v={discoveryInfo.entryPoint} />}
                                        {discoveryInfo.backendEntryPoint && <TechRow k="BE Entry" v={discoveryInfo.backendEntryPoint} />}
                                        {discoveryInfo.frontendEntryPoint && <TechRow k="FE Entry" v={discoveryInfo.frontendEntryPoint} />}
                                        {discoveryInfo.moduleType && <TechRow k="Module" v={discoveryInfo.moduleType} />}
                                        {discoveryInfo.databaseUsed !== undefined && <TechRow k="Database" v={discoveryInfo.databaseUsed ? "Yes" : "No"} />}
                                        {serverInfo.port && <TechRow k="Port" v={String(serverInfo.port)} />}
                                        {serverInfo.backendPort && <TechRow k="BE Port" v={String(serverInfo.backendPort)} />}
                                        {serverInfo.frontendPort && <TechRow k="FE Port" v={String(serverInfo.frontendPort)} />}
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <p className="text-[#717584] text-xs font-label uppercase tracking-widest text-center">No variables captured.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ROW 2: Bugs Detection Grid */}
                    <div className="space-y-4">
                        <h2 className="font-arcade text-3xl text-white uppercase flex items-center gap-4">
                            BUGS_DETECTED 
                            <span className="text-[#ff7351] text-lg bg-[#ff7351]/10 px-3 py-1">{job.bugs.length}</span>
                        </h2>
                        <BugsPanel bugs={job.bugs as Bug[]} />
                    </div>

                    {/* ROW 3: Tests Block */}
                    <div className="space-y-4">
                        <h2 className="font-arcade text-3xl text-white uppercase flex items-center justify-between border-b-2 border-[#1a1f2f] pb-4 mt-8">
                            TESTS RUN
                        </h2>
                        <TestsPanel tests={job.tests as Test[]} />
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─── Component Helpers ─────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: number; color: "primary" | "green" | "red" }) {
    const colors = {
        primary: "text-[#f3ffca] border-[#f3ffca]/30 bg-[#f3ffca]/5 shadow-[2px_2px_0px_0px_rgba(243,255,202,0.3)]",
        green: "text-[#cafd00] border-[#cafd00]/30 bg-[#cafd00]/5 shadow-[2px_2px_0px_0px_rgba(202,253,0,0.3)]",
        red: "text-[#ff7351] border-[#ff7351]/30 bg-[#ff7351]/5 shadow-[2px_2px_0px_0px_rgba(255,115,81,0.3)]",
    };
    return (
        <div className={`border-2 flex flex-col justify-center py-4 px-6 min-w-[120px] ${colors[color]}`}>
            <span className="text-[10px] uppercase tracking-widest font-label opacity-70 mb-1">{label}</span>
            <span className="font-arcade text-4xl leading-none">{String(value).padStart(2, '0')}</span>
        </div>
    );
}

function TechRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between items-center py-1.5 border-b border-[#1a1f2f] last:border-0">
            <span className="text-[#a7aabb]">{k}</span>
            <code className="text-[#cafd00]">{v}</code>
        </div>
    );
}

function StatusChip({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        COMPLETED: { bg: "bg-[#cafd00]", text: "text-black", label: "COMPLETED MISSION" },
        FAILED: { bg: "bg-[#ff7351]", text: "text-black", label: "FAILED MISSION" },
        PENDING: { bg: "bg-[#717584]", text: "text-black", label: "PENDING MISSION" },
        ANALYZING: { bg: "bg-[#fc8700]", text: "text-black", label: "ANALYZING TARGET" },
        SETTING_UP: { bg: "bg-[#fc8700]", text: "text-black", label: "SETTING UP FOR BATTLE" },
        TESTING: { bg: "bg-[#fc8700]", text: "text-black", label: "ENGAGED IN TESTING" },
    };
    const c = config[status] ?? config.PENDING;
    // Glitchy bar effect next to the chip
    return (
        <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 font-arcade text-sm uppercase tracking-widest shadow-sm ${c.bg} ${c.text}`}>
                {c.label}
            </span>
            <div className="h-1 w-16 bg-[#1a1f2f] overflow-hidden flex">
                <div className={`h-full w-full ${c.bg} opacity-50`} style={{ animation: "scanLine 2s ease-in-out infinite" }}></div>
            </div>
        </div>
    );
}

// ─── BUGS PANEL ──────────────────────────────────────────────────────────────

function BugsPanel({ bugs }: { bugs: Bug[] }) {
    if (bugs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-[#1a1f2f]/30 border-2 border-dashed border-[#cafd00]/30 h-full">
                <span className="font-arcade text-8xl text-[#cafd00] mb-6 drop-shadow-[0_0_15px_rgba(202,253,0,0.5)]">✓</span>
                <p className="font-arcade text-2xl text-[#cafd00] uppercase tracking-widest">NO BUGS DETECTED</p>
                <p className="text-[#717584] text-sm font-label uppercase tracking-widest mt-2">All tests passed cleanly.</p>
            </div>
        );
    }
    return (
        <div className="space-y-6">
            <p className="text-[#717584] text-xs font-mono uppercase tracking-widest">
                Sorted by threat level (Confidence)
            </p>
            {bugs.map((bug, i) => (
                <BugCard key={bug.id} bug={bug} index={i + 1} />
            ))}
        </div>
    );
}

function BugCard({ bug, index }: { bug: Bug; index: number }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const fixes = parseSuggestedFixes(bug.suggestedFixes);

    const confidenceConfig = {
        HIGH: { border: "border-t-[#ff7351]", bg: "bg-[#ff7351]/5", badge: "bg-[#ff7351]/20 text-[#ff7351] border border-[#ff7351]/40" },
        MEDIUM: { border: "border-t-[#fc8700]", bg: "bg-[#fc8700]/5", badge: "bg-[#fc8700]/20 text-[#fc8700] border border-[#fc8700]/40" },
        LOW: { border: "border-t-[#717584]", bg: "bg-[#717584]/5", badge: "bg-[#717584]/20 text-[#a7aabb] border border-[#717584]/40" },
    };
    const c = confidenceConfig[bug.confidence] ?? confidenceConfig.LOW;

    return (
        <div
            className={`border-t-4 ${c.border} bg-[#0e0e0e] border-[1px] border-[#1a1f2f] transition-all hover:bg-[#141928] animate-fade-in-up`}
            style={{ animationDelay: `${(index - 1) * 60}ms` }}
        >
            {/* Card header */}
            <div className="p-6">
                <div className="flex items-start justify-between gap-3 mb-6">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-arcade text-2xl text-[#717584]">#{String(index).padStart(2, "0")}</span>
                        <span className={`font-label text-xs uppercase tracking-widest px-3 py-1 ${c.badge}`}>
                            {bug.confidence} CONFIDENCE
                        </span>
                        {bug.affectedLayer && (
                            <span className="font-label text-[10px] uppercase tracking-wider px-3 py-1 bg-[#1a1f2f] text-[#a7aabb]">
                                {formatAffectedLayer(bug.affectedLayer)}
                            </span>
                        )}
                    </div>
                    {bug.sourceFile && (
                        <code className="text-[#a7aabb] bg-[#1a1f2f] px-2 py-1 text-xs font-mono shrink-0">{bug.sourceFile}</code>
                    )}
                </div>

                <h3 className="text-[#ffffff] font-arcade text-xl leading-snug mb-4">
                    {bug.message}
                </h3>

                {bug.rootCause && (
                    <div className="bg-[#000000] border border-[#1a1f2f] p-4 text-sm font-body leading-relaxed mb-4">
                        <span className="text-[#fc8700] font-bold block mb-1 font-label uppercase tracking-widest text-[10px]">Root Cause_</span>
                        <span className="text-[#a7aabb]">{bug.rootCause}</span>
                    </div>
                )}

                {bug.testFile && (
                    <p className="text-[#717584] text-xs font-mono mt-4">
                        Detected during: <span className="text-[#cafd00]">{bug.testFile}</span>
                        {bug.testName && <span className="text-[#717584]"> → {bug.testName}</span>}
                    </p>
                )}
            </div>

            {/* Suggested fixes accordion */}
            {fixes.length > 0 && (
                <div className="border-t border-[#1a1f2f]">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#fc8700]/10 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-3">
                            <Sparkles className="w-5 h-5 text-[#fc8700]" />
                            <span className="font-arcade text-lg text-[#fc8700] uppercase tracking-wider">
                                View Patches
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-[#fc8700]/20 text-[#fc8700] font-arcade">
                                {fixes.length}
                            </span>
                        </div>
                        <ChevronDown className={`w-6 h-6 text-[#717584] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[8000px] opacity-100" : "max-h-0 opacity-0"}`}>
                        <div className="px-6 pb-6 space-y-8 bg-[#000000]/50 pt-4 border-t border-[#1a1f2f]">
                            {fixes.map((fix, fi) => (
                                <div key={`${fix.filePath}-${fi}`} className="space-y-4">
                                    <div className="flex items-center gap-3 pb-2 border-b border-[#1a1f2f]">
                                        {fix.type === "modify"
                                            ? <FileEdit className="w-4 h-4 text-[#a7aabb]" />
                                            : <Sparkles className="w-4 h-4 text-[#a7aabb]" />}
                                        <span className="text-xs uppercase tracking-wider text-[#a7aabb] font-label">
                                            {fix.type === "modify" ? "Target Modification" : "New File Creation"}
                                        </span>
                                        <code className="text-xs font-mono text-[#f3ffca] bg-[#1a1f2f] px-2 py-0.5 ml-auto">
                                            {fix.filePath}
                                        </code>
                                    </div>

                                    <div className="space-y-4">
                                        {fix.existingSnippet && (
                                            <div>
                                                <div className="text-xs text-[#ff7351] font-label uppercase tracking-widest mb-2 bg-[#ff7351]/10 px-3 py-1 border border-[#ff7351]/20 inline-block">Current Bad Logic</div>
                                                <div className="border border-[#ff7351]/30">
                                                    <CodeBlock code={fix.existingSnippet} language="javascript" showCopyButton={true} />
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <div className="text-xs text-[#cafd00] font-label uppercase tracking-widest mb-2 bg-[#cafd00]/10 px-3 py-1 border border-[#cafd00]/20 inline-block">Generated Patch</div>
                                            <div className="border border-[#cafd00]/30 shadow-[0_0_15px_rgba(202,253,0,0.1)]">
                                                <CodeBlock code={fix.updatedSnippet} language="javascript" showCopyButton={true} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── TESTS PANEL ─────────────────────────────────────────────────────────────

function TestsPanel({ tests }: { tests: Test[] }) {
    const [filter, setFilter] = useState<"all" | "passed" | "failed">("all");

    const backendTests = tests.filter(t => !isFullStackTest(t));
    const fullStackTests = tests.filter(isFullStackTest);

    const applyFilter = (arr: Test[]) => {
        if (filter === "passed") return arr.filter(t => t.status === "PASS");
        if (filter === "failed") return arr.filter(t => t.status !== "PASS");
        return arr;
    };

    const filteredBrowser = applyFilter(fullStackTests);
    const filteredBackend = applyFilter(backendTests);

    const fullStackByFeature = filteredBrowser.reduce((acc, test) => {
        const feature = test.featureName?.trim() || "Ungrouped";
        if (!acc.has(feature)) acc.set(feature, []);
        acc.get(feature)?.push(test);
        return acc;
    }, new Map<string, Test[]>());

    if (tests.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-[#1a1f2f]/30 border-2 border-dashed border-[#444756] h-32">
                <p className="font-arcade text-xl text-[#717584] uppercase tracking-widest">ZERO DATA</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Filter buttons */}
            <div className="flex items-center gap-2 mb-4">
                {(["all", "passed", "failed"] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 font-label text-[10px] uppercase tracking-widest transition-all border ${filter === f
                            ? f === "passed" ? "bg-[#cafd00]/20 text-[#cafd00] border-[#cafd00]"
                                : f === "failed" ? "bg-[#ff7351]/20 text-[#ff7351] border-[#ff7351]"
                                    : "bg-[#f3ffca]/20 text-[#f3ffca] border-[#f3ffca]"
                            : "bg-[#1a1f2f] text-[#717584] border-transparent hover:border-[#444756]"}`}
                    >
                        {f} ({f === "all" ? tests.length : f === "passed" ? tests.filter(t => t.status === "PASS").length : tests.filter(t => t.status !== "PASS").length})
                    </button>
                ))}
            </div>

            {/* Browser tests (Grouped) */}
            {Array.from(fullStackByFeature.entries()).map(([featureName, featureTests]) => (
                <div key={featureName} className="bg-[#141928] border border-[#1a1f2f]">
                    <div className="px-5 py-3 border-b border-[#1a1f2f] bg-[#0e0e0e] flex items-center justify-between">
                        <span className="font-arcade text-xs text-[#fc8700] uppercase tracking-wider">Browser Core</span>
                        <span className="text-[#a7aabb] font-label text-[10px] uppercase tracking-widest">{featureName}</span>
                    </div>
                    <div className="divide-y divide-[#1a1f2f]/50">
                        {featureTests.map(test => (
                            <BrowserEdgeCaseRow key={test.id} test={test} />
                        ))}
                    </div>
                </div>
            ))}

            {/* API Tests */}
            {filteredBackend.length > 0 && (
                <div className="bg-[#141928] border border-[#1a1f2f] mt-8">
                    <div className="px-5 py-3 border-b border-[#1a1f2f] bg-[#0e0e0e] flex items-center justify-between">
                        <span className="font-arcade !text-base text-[#b024ff] uppercase tracking-wider">API Validation</span>
                        <span className="text-[#a7aabb] font-label text-[10px] uppercase tracking-widest">{filteredBackend.length} scripts</span>
                    </div>
                    <div className="divide-y divide-[#1a1f2f]/50">
                        {filteredBackend.map(test => (
                            <TestCard key={test.id} test={test} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function BrowserEdgeCaseRow({ test }: { test: Test }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const steps = parseSteps(test.steps);
    const networkAssertions = parseNetworkAssertions(test.networkAssertions);
    const uiAssertions = parseUiAssertions(test.uiAssertions);

    const statusConfig = {
        PASS: { 
            bg: "bg-[#cafd00]/10", 
            text: "text-[#cafd00]", 
            border: "border-[#cafd00]",
            icon: <CheckCircle2 className="w-5 h-5" />
        },
        FAIL: { 
            bg: "bg-[#ff7351]/10", 
            text: "text-[#ff7351]", 
            border: "border-[#ff7351]",
            icon: <XCircle className="w-5 h-5" />
        },
        ERROR: { 
            bg: "bg-[#fc8700]/10", 
            text: "text-[#fc8700]", 
            border: "border-[#fc8700]",
            icon: <AlertCircle className="w-5 h-5" />
        },
    } as const;
    const c = statusConfig[test.status] ?? statusConfig.FAIL;

    return (
        <div className={`bg-[#141928] border-l-4 ${c.border} rounded-r-lg overflow-hidden hover:shadow-[0_0_20px_rgba(252,135,0,0.1)] transition-all duration-300`}>
            {/* Header */}
            <div className="p-5 flex items-start gap-4">
                {/* Status Icon */}
                <div className={`${c.bg} ${c.text} p-3 rounded-lg`}>
                    {c.icon}
                </div>

                {/* Test Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <h4 className="text-[#e2e4f6] text-base font-semibold leading-tight">{test.testName}</h4>
                        <div className={`px-3 py-1 rounded-full font-arcade text-xs uppercase ${c.bg} ${c.text} whitespace-nowrap`}>
                            {test.status}
                        </div>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-4 text-xs text-[#717584] font-mono">
                        {test.executedAt && (
                            <span className="flex items-center gap-1.5">
                                <span className="text-[#fc8700]">⏱</span>
                                {new Date(test.executedAt).toLocaleTimeString()}
                            </span>
                        )}
                        {test.exitCode !== null && (
                            <span className="flex items-center gap-1.5">
                                <span className="text-[#fc8700]">EXIT</span>
                                {test.exitCode}
                            </span>
                        )}
                        {test.featureName && (
                            <span className="flex items-center gap-1.5">
                                <span className="text-[#fc8700]">FEATURE</span>
                                {test.featureName}
                            </span>
                        )}
                    </div>

                    {/* Network Assertions - Show by default */}
                    {networkAssertions.length > 0 && (
                        <div className="mt-4 p-4 bg-[#0e0e0e] rounded-lg border border-[#1a1f2f]">
                            <div className="text-[10px] uppercase tracking-widest text-[#717584] font-mono mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 bg-[#fc8700] rounded-full"></span>
                                Network Assertions
                            </div>
                            <div className="space-y-2">
                                {networkAssertions.map((assertion, i) => (
                                    <div key={i} className={`p-3 rounded border ${assertion.passed ? 'bg-[#cafd00]/5 border-[#cafd00]/20' : 'bg-[#ff7351]/5 border-[#ff7351]/20'}`}>
                                        <div className="flex items-start justify-between gap-4 mb-1">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${assertion.passed ? 'bg-[#cafd00] text-black' : 'bg-[#ff7351] text-white'}`}>
                                                {assertion.method}
                                            </span>
                                            <span className={`text-xs font-semibold ${assertion.passed ? 'text-[#cafd00]' : 'text-[#ff7351]'}`}>
                                                {assertion.actualStatus}
                                            </span>
                                        </div>
                                        <div className="text-xs text-[#a7aabb] font-mono break-all">{assertion.url}</div>
                                        <div className="text-[10px] text-[#717584] mt-1">
                                            Expected: <span className={assertion.passed ? 'text-[#cafd00]' : 'text-[#ff7351]'}>{assertion.expectedStatus}</span>
                                            {!assertion.passed && <span className="ml-2 text-[#ff7351]">❌ FAILED</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* UI Assertions - Show by default */}
                    {uiAssertions.length > 0 && (
                        <div className="mt-4 p-4 bg-[#0e0e0e] rounded-lg border border-[#1a1f2f]">
                            <div className="text-[10px] uppercase tracking-widest text-[#717584] font-mono mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 bg-[#fc8700] rounded-full"></span>
                                UI Assertions
                            </div>
                            <div className="space-y-2">
                                {uiAssertions.map((assertion, i) => (
                                    <div key={i} className={`p-3 rounded border ${assertion.passed ? 'bg-[#cafd00]/5 border-[#cafd00]/20' : 'bg-[#ff7351]/5 border-[#ff7351]/20'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <code className="text-xs text-[#fc8700] bg-[#1a1f2f] px-2 py-1 rounded font-mono">
                                                {assertion.selector}
                                            </code>
                                            <span className={`text-xs font-bold ${assertion.passed ? 'text-[#cafd00]' : 'text-[#ff7351]'}`}>
                                                {assertion.passed ? '✓ PASS' : '✗ FAIL'}
                                            </span>
                                        </div>
                                        <div className="text-xs space-y-1">
                                            <div className="text-[#717584]">
                                                Expected: <span className="text-[#a7aabb]">{assertion.expected}</span>
                                            </div>
                                            <div className="text-[#717584]">
                                                Actual: <span className={assertion.passed ? 'text-[#cafd00]' : 'text-[#ff7351]'}>{assertion.actual}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Console Output - Show by default */}
                    {test.output && (
                        <div className="mt-4 p-4 bg-[#0e0e0e] rounded-lg border border-[#1a1f2f]">
                            <div className="text-[10px] uppercase tracking-widest text-[#717584] font-mono mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 bg-[#fc8700] rounded-full"></span>
                                Console Output
                            </div>
                            <pre className="text-xs text-[#a7aabb] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                                {test.output}
                            </pre>
                        </div>
                    )}

                    {/* Expandable Test Execution Flow */}
                    {steps.length > 0 && (
                        <div className="mt-4">
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-xs text-[#fc8700] hover:text-[#ff9b1a] font-semibold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer"
                            >
                                <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                {isExpanded ? 'Hide Test Flow' : 'Show Test Flow'}
                            </button>

                            {isExpanded && (
                                <div className="mt-4 animate-in slide-in-from-top-2 duration-300">
                                    {/* Steps - Visual Timeline */}
                                    <div className="p-4 bg-[#0e0e0e] rounded-lg border border-[#1a1f2f]">
                                        <div className="text-[10px] uppercase tracking-widest text-[#717584] font-mono mb-4 flex items-center gap-2">
                                            <span className="w-2 h-2 bg-[#fc8700] rounded-full"></span>
                                            Test Execution Flow
                                        </div>
                                        <div className="space-y-3">
                                            {steps.map((step, i) => {
                                                const { Icon, color } = getStepIcon(step);
                                                const isLast = i === steps.length - 1;
                                                
                                                return (
                                                    <div key={i} className="flex gap-3 group">
                                                        {/* Timeline track */}
                                                        <div className="flex flex-col items-center">
                                                            {/* Icon with colored background */}
                                                            <div 
                                                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all group-hover:scale-110 group-hover:shadow-lg"
                                                                style={{ 
                                                                    backgroundColor: `${color}15`,
                                                                    border: `1.5px solid ${color}40`
                                                                }}
                                                            >
                                                                <Icon 
                                                                    className="w-4 h-4" 
                                                                    style={{ color }}
                                                                />
                                                            </div>
                                                            
                                                            {/* Connecting line */}
                                                            {!isLast && (
                                                                <div 
                                                                    className="w-0.5 h-full min-h-[16px] mt-1"
                                                                    style={{ backgroundColor: `${color}30` }}
                                                                />
                                                            )}
                                                        </div>
                                                        
                                                        {/* Step content */}
                                                        <div className="flex-1 pb-2">
                                                            <div className="flex items-start gap-2 mb-1">
                                                                <span 
                                                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono shrink-0"
                                                                    style={{ 
                                                                        backgroundColor: `${color}20`,
                                                                        color: color
                                                                    }}
                                                                >
                                                                    {i + 1}
                                                                </span>
                                                                <p className="text-sm text-[#e2e4f6] leading-relaxed group-hover:text-white transition-colors">
                                                                    {step}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Screenshot */}
                {test.screenshotUrl && (
                    <div className="shrink-0">
                        <Dialog>
                            <DialogTrigger asChild>
                                <button className="w-40 h-24 border-2 border-[#444756] hover:border-[#fc8700] overflow-hidden transition-all bg-[#0e0e0e] rounded-lg group relative">
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                        <div className="text-center">
                                            <Maximize2 className="w-5 h-5 text-[#fc8700] mx-auto mb-1" />
                                            <span className="font-arcade text-[9px] text-[#fc8700] uppercase">View Full</span>
                                        </div>
                                    </div>
                                    <img src={test.screenshotUrl} alt={test.testName} className="w-full h-full object-cover" />
                                </button>
                            </DialogTrigger>
                            <DialogContent className="!w-[90vw] !max-w-[1600px] h-[90vh] p-6 !bg-[#0e0e0e] border-[3px] border-[#fc8700] overflow-hidden shadow-[0_0_50px_rgba(252,135,0,0.3)] flex flex-col">
                                <DialogTitle className="font-arcade text-xl text-[#fc8700] uppercase tracking-widest flex items-center gap-3 flex-shrink-0">
                                    <TerminalSquare className="w-5 h-5" />
                                    {test.testName}
                                </DialogTitle>
                                <div className="flex-1 min-h-0 border-2 border-[#444756] mt-4 rounded-lg overflow-hidden bg-black">
                                    <img src={test.screenshotUrl} alt="full screenshot" className="w-full h-full object-contain" />
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}
            </div>
        </div>
    );
}

function TestCard({ test }: { test: Test }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleDownload = () => {
        const blob = new Blob([test.fileContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = test.testFile.split("/").pop() || "test.js";
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        toast.success("Test file downloaded");
    };

    const statusConfig = {
        PASS: { bg: "bg-[#cafd00]/10", text: "text-[#cafd00]", border: "border-l-[#cafd00]" },
        FAIL: { bg: "bg-[#ff7351]/10", text: "text-[#ff7351]", border: "border-l-[#ff7351]" },
        ERROR: { bg: "bg-[#fc8700]/10", text: "text-[#fc8700]", border: "border-l-[#fc8700]" },
    } as const;
    const c = statusConfig[test.status as keyof typeof statusConfig] ?? statusConfig.FAIL;

    return (
        <div className={`border-l-2 ${c.border} bg-[#000000]/30`}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#1a1f2f] transition-colors text-left"
            >
                <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`px-3 py-1 font-arcade !text-sm uppercase shrink-0 ${c.bg} ${c.text}`}>{test.status}</span>
                    <div className="flex flex-col gap-1 items-start">
                        <span className="text-[#e2e4f6] !text-sm font-mono truncate leading-none">{test.testFile}</span>
                        <div className="flex gap-3 text-[10px] font-mono text-[#717584] uppercase tracking-widest leading-none">
                            {test.executedAt && <span><span className="text-[#444756]">EXEC_</span> {new Date(test.executedAt).toLocaleTimeString()}</span>}
                            {test.exitCode !== null && <span><span className="text-[#444756]">EXIT_</span> {test.exitCode}</span>}
                        </div>
                    </div>
                </div>
                <ChevronDown className={`w-7 h-7 text-[#717584] transition-transform duration-300 shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
            </button>

            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="p-4 bg-[#0e0e0e] border-t border-[#1a1f2f] space-y-4">
                    {test.output && (
                        <div>
                            <span className="text-[10px] text-[#a7aabb] font-label uppercase tracking-widest block mb-2">Terminal Printout_</span>
                            <div className="border border-[#1a1f2f] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                                <CodeBlock code={test.output} language="bash" showCopyButton={false} />
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-[#b024ff] font-label uppercase tracking-widest">Source Script_</span>
                            <button
                                onClick={handleDownload}
                                className="!text-lg text-[#b024ff] hover:text-white transition-colors font-arcade uppercase px-4 py-2 border border-[#b024ff]/30 rounded hover:bg-[#b024ff]/10"
                            >
                                [⬇ Download]
                            </button>
                        </div>
                        <div className="border border-[#b024ff]/30 shadow-[0_0_15px_rgba(176,36,255,0.1)]">
                            <CodeBlock code={test.fileContent} language="javascript" showCopyButton={true} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Loading / Cancelled / NotFound States ───────────────────────────────────

const FUNNY_MESSAGES = [
    "DEPLOYING SENTINELS INTO THE DATAFRAME...",
    "BREACHING SERVER FIREWALLS...",
    "REROUTING ENCRYPTION KEYS...",
    "CALIBRATING NEON TUBES...",
    "DISSECTING YOUR LOGIC GATES...",
    "SPINNING UP SUB-PROCESSORS...",
    "INSERTING QUARTERS...",
    "WAITING FOR CLAUDE TO WAKE UP...",
    "UPDATING HIGHSCORE LEADERBOARD...",
    "INJECTING CAFFEINE INTO NODE_MODULES...",
    "COMPUTING PROBABILITY OF SYNTAX ERRORS...",
    "BATTLE CRUSIERS ENGAGING...",
];

const STATUS_LABELS: Record<string, string> = {
    PENDING: "LOADING_CARTRIDGE",
    ANALYZING: "INITIAL_SCAN",
    SETTING_UP: "SPAWNING_ARENA",
    TESTING: "BOSS_FIGHT_ACTIVE",
};

function LoadingState({ onBack, onCancel, isCancelling, status }: {
    onBack: () => void; onCancel: () => void; isCancelling: boolean; status: string;
}) {
    const [msgIdx, setMsgIdx] = useState(0);
    const [fading, setFading] = useState(false);
    const [dots, setDots] = useState(0);

    useEffect(() => {
        const msgTimer = setInterval(() => {
            setFading(true);
            setTimeout(() => { setMsgIdx(p => (p + 1) % FUNNY_MESSAGES.length); setFading(false); }, 400);
        }, 4000);
        const dotsTimer = setInterval(() => setDots(p => (p + 1) % 4), 500);
        return () => { clearInterval(msgTimer); clearInterval(dotsTimer); };
    }, []);

    const statusLabel = STATUS_LABELS[status] ?? "PROCESSING_DATA";
    const dotsStr = ".".repeat(dots);

    return (
        <div className="min-h-[100dvh] bg-[#000000] flex flex-col relative overflow-hidden">
            {/* Background grid */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDM5LjVoNDBWNDBoLTR6IiBmaWxsPSIjMWExZjJmIiBvcGFjaXR5PSIwLjUiLz48cGF0aCBkPSJNMzkuNSAwVjQwaC41VjB6IiBmaWxsPSIjMWExZjJmIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] -z-0"></div>
            
            <Navbar />
            
            <div className="flex-1 flex items-center justify-center px-6 relative z-10">
                <div className="w-full max-w-3xl border-4 border-[#fc8700] bg-[#0e0e0e] p-12 shadow-[12px_12px_0px_0px_rgba(252,135,0,0.4)] relative">
                    
                    {/* Corner accents */}
                    <div className="absolute -top-1 -left-1 w-4 h-4 bg-[#fc8700]"></div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#fc8700]"></div>

                    <div className="text-center space-y-12">
                        <p className="font-arcade text-[#fc8700] text-3xl uppercase tracking-widest drop-shadow-[0_0_10px_rgba(252,135,0,0.8)]">
                            {statusLabel}{dotsStr}
                        </p>

                        <div className="h-1 w-full bg-[#1a1f2f] relative overflow-hidden">
                            <div className="absolute top-0 left-0 h-full bg-[#fc8700] w-1/3 shadow-[0_0_20px_#fc8700]" style={{ animation: "scanLine 1.5s linear infinite" }}></div>
                        </div>

                        <div className="h-16 flex items-center justify-center">
                            <p className={`font-arcade text-3xl text-white uppercase leading-tight transition-all duration-400 ${fading ? "opacity-0 -translate-y-2 scale-95" : "opacity-100 translate-y-0 scale-100"}`}>
                                {FUNNY_MESSAGES[msgIdx]}
                            </p>
                        </div>

                        <div className="flex justify-center pt-8 border-t-2 border-dashed border-[#1a1f2f]">
                            <button
                                onClick={onCancel}
                                disabled={isCancelling}
                                className="px-8 py-4 bg-transparent border-2 border-[#ff7351] text-[#ff7351] font-arcade text-xl uppercase tracking-widest hover:bg-[#ff7351] hover:text-black hover:shadow-[0_0_20px_#ff7351] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {isCancelling ? "EJECTING..." : "EJECT_CARTRIDGE"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes scanLine {
                    0% { left: -33%; }
                    100% { left: 100%; }
                }
            `}</style>
        </div>
    );
}

function CancelledState({ backHref }: { backHref: string }) {
    return (
        <div className="min-h-screen bg-[#000000] flex items-center justify-center px-6 relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDM5LjVoNDBWNDBoLTR6IiBmaWxsPSIjMWExZjJmIiBvcGFjaXR5PSIwLjUiLz48cGF0aCBkPSJNMzkuNSAwVjQwaC41VjB6IiBmaWxsPSIjMWExZjJmIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)] -z-0"></div>
            <Navbar />
            <div className="text-center max-w-xl p-12 bg-[#0e0e0e] border-4 border-[#ff7351] shadow-[12px_12px_0px_0px_rgba(255,115,81,0.4)] relative z-10">
                <p className="font-arcade text-8xl text-[#ff7351] mb-6 drop-shadow-[0_0_20px_rgba(255,115,81,0.5)]">X</p>
                <h2 className="font-arcade text-5xl text-white uppercase tracking-widest mb-4">GAME_OVER</h2>
                <p className="text-[#a7aabb] font-label text-sm uppercase tracking-widest mb-10">Mission manually aborted.</p>
                <a
                    href={backHref}
                    className="inline-flex items-center gap-3 px-8 py-4 bg-white text-black font-arcade text-xl uppercase tracking-widest hover:bg-[#ff7351] transition-colors"
                >
                    [ RETURN TO BASE ]
                </a>
            </div>
        </div>
    );
}

function NotFoundState() {
    return (
        <div className="min-h-screen bg-[#000000] flex items-center justify-center px-6 relative">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDM5LjVoNDBWNDBoLTR6IiBmaWxsPSIjMWExZjJmIiBvcGFjaXR5PSIwLjUiLz48cGF0aCBkPSJNMzkuNSAwVjQwaC41VjB6IiBmaWxsPSIjMWExZjJmIiBvcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] -z-0"></div>
            <Navbar />
            <div className="text-center z-10 p-12 bg-[#0e0e0e] border-[1px] border-[#1a1f2f]">
                <p className="font-arcade text-9xl text-[#444756] mb-4 mix-blend-screen">404</p>
                <p className="font-arcade text-3xl text-white uppercase mb-2">FILE_NOT_FOUND</p>
                <p className="text-[#717584] text-xs font-label uppercase tracking-widest">This record has been wiped from the database.</p>
            </div>
        </div>
    );
}
