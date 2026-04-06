"use client";

import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CodeBlock } from "@/components/code-block";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, FileEdit, Sparkles, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/navbar";

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
    const [activeTab, setActiveTab] = useState<"bugs" | "tests">("bugs");

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
        <div className="min-h-screen bg-[#0a0e1a]">
            <Navbar />

            {/* Layout: sidebar + main */}
            <div className="flex pt-12 min-h-screen">

                {/* ── LEFT SIDEBAR ─────────────────────────────────────── */}
                <aside className="w-80 shrink-0 bg-[#000000] sticky top-12 h-[calc(100vh-48px)] overflow-y-auto flex flex-col">
                    <div className="p-5 flex flex-col gap-5 flex-1">

                        {/* Back button */}
                        <button
                            onClick={() => router.push(backHref)}
                            className="flex items-center gap-2 text-[#a7aabb] hover:text-[#f3ffca] text-xs uppercase tracking-widest font-label transition-colors group"
                        >
                            <span className="group-hover:-translate-x-1 transition-transform">←</span>
                            Back
                        </button>

                        {/* Repo + status */}
                        <div className="space-y-2">
                            <h1 className="font-arcade text-2xl text-[#f3ffca] uppercase leading-tight break-all">
                                {job.repository.repoOwner}/{job.repository.repoName}
                            </h1>
                            <StatusChip status={job.status} />
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                            <StatBox label="TOTAL" value={totalTests} color="primary" />
                            <StatBox label="PASS" value={passedTests} color="green" />
                            <StatBox label="FAIL" value={failedTests} color="red" />
                        </div>

                        {/* AI Summary */}
                        {job.summary && (
                            <SidebarCollapsible label="AI_SUMMARY" defaultOpen={true}>
                                <p className="text-[#a7aabb] text-xs leading-relaxed font-body">
                                    {job.summary.replace(/<task_summary>/gi, "").replace(/<\/task_summary>/gi, "").replace(/\\n/g, " ").trim()}
                                </p>
                            </SidebarCollapsible>
                        )}

                        {/* Bug digest */}
                        {job.bugs.length > 0 && (
                            <SidebarCollapsible label={`BUGS_FOUND (${job.bugs.length})`} defaultOpen={true}>
                                <div className="space-y-2">
                                    {job.bugs.map((bug) => (
                                        <button
                                            key={bug.id}
                                            onClick={() => setActiveTab("bugs")}
                                            className="w-full text-left group"
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className={`mt-1 shrink-0 w-2 h-2 rounded-full ${bug.confidence === "HIGH" ? "bg-[#ff7351]" : bug.confidence === "MEDIUM" ? "bg-[#fc8700]" : "bg-[#717584]"}`} />
                                                <div>
                                                    <p className="text-[#e2e4f6] text-xs font-medium leading-tight group-hover:text-[#f3ffca] transition-colors line-clamp-2">
                                                        {bug.message}
                                                    </p>
                                                    {bug.sourceFile && (
                                                        <p className="text-[#717584] text-[10px] font-mono mt-0.5 truncate">{bug.sourceFile}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </SidebarCollapsible>
                        )}

                        {/* Tech details */}
                        {(Object.keys(discoveryInfo).length > 0 || Object.keys(serverInfo).length > 0) && (
                            <SidebarCollapsible label="TECH_DETAILS" defaultOpen={false}>
                                <div className="space-y-1.5 text-xs font-mono">
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
                            </SidebarCollapsible>
                        )}

                        {/* Bug description */}
                        <SidebarCollapsible label="MISSION_BRIEF" defaultOpen={false}>
                            <p className="text-[#a7aabb] text-xs leading-relaxed font-body">{job.bugDescription}</p>
                        </SidebarCollapsible>
                    </div>
                </aside>

                {/* ── RIGHT MAIN PANEL ────────────────────────────────── */}
                <main className="flex-1 min-h-[calc(100vh-48px)] flex flex-col">

                    {/* Tab bar */}
                    <div className="sticky top-12 z-10 bg-[#0e1320] border-b-2 border-[#1a1f2f] flex items-stretch">
                        <TabButton active={activeTab === "bugs"} onClick={() => setActiveTab("bugs")} count={job.bugs.length} color="red">
                            BUGS
                        </TabButton>
                        <TabButton active={activeTab === "tests"} onClick={() => setActiveTab("tests")} count={job.tests.length} color="primary">
                            TESTS
                        </TabButton>
                        {/* Spacer shows section counts */}
                        <div className="flex-1 flex items-center justify-end px-6 gap-4 text-[#717584] text-[10px] font-mono uppercase">
                            <span className="text-[#cafd00]/60">{passedTests} passed</span>
                            <span className="text-[#ff7351]/60">{failedTests} failed</span>
                        </div>
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 p-6 space-y-4">
                        {activeTab === "bugs" && (
                            <BugsPanel bugs={job.bugs as Bug[]} />
                        )}
                        {activeTab === "tests" && (
                            <TestsPanel tests={job.tests as Test[]} />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

// ─── Sidebar helpers ─────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: number; color: "primary" | "green" | "red" }) {
    const colors = {
        primary: "text-[#f3ffca] border-[#f3ffca]/20 bg-[#f3ffca]/5",
        green: "text-[#cafd00] border-[#cafd00]/20 bg-[#cafd00]/5",
        red: "text-[#ff7351] border-[#ff7351]/20 bg-[#ff7351]/5",
    };
    return (
        <div className={`border flex flex-col items-center py-2 px-1 ${colors[color]}`}>
            <span className="font-arcade text-2xl leading-none">{value}</span>
            <span className="text-[9px] uppercase tracking-widest font-label opacity-70 mt-0.5">{label}</span>
        </div>
    );
}

function TechRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[#717584] shrink-0">{k}:</span>
            <code className="text-[#f3ffca] bg-[#1a1f2f] px-1 truncate text-[10px]">{v}</code>
        </div>
    );
}

function SidebarCollapsible({ label, children, defaultOpen }: { label: string; children: React.ReactNode; defaultOpen: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-[#1a1f2f]">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-3 py-2 bg-[#0e1320] hover:bg-[#1a1f2f] transition-colors"
            >
                <span className="text-[#fc8700] font-arcade text-sm uppercase tracking-wider">{label}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#717584] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
            {open && <div className="p-3 bg-[#000000]/30">{children}</div>}
        </div>
    );
}

function StatusChip({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        COMPLETED: { bg: "bg-[#cafd00]/10 border border-[#cafd00]/30", text: "text-[#cafd00]", label: "● COMPLETED" },
        FAILED: { bg: "bg-[#ff7351]/10 border border-[#ff7351]/30", text: "text-[#ff7351]", label: "✗ FAILED" },
        PENDING: { bg: "bg-[#717584]/10 border border-[#717584]/30", text: "text-[#717584]", label: "○ PENDING" },
        ANALYZING: { bg: "bg-[#fc8700]/10 border border-[#fc8700]/30", text: "text-[#fc8700]", label: "◈ ANALYZING" },
        SETTING_UP: { bg: "bg-[#fc8700]/10 border border-[#fc8700]/30", text: "text-[#fc8700]", label: "◈ SETTING_UP" },
        TESTING: { bg: "bg-[#fc8700]/10 border border-[#fc8700]/30", text: "text-[#fc8700]", label: "◈ TESTING" },
    };
    const c = config[status] ?? config.PENDING;
    return (
        <span className={`inline-flex items-center px-2.5 py-1 font-arcade text-sm uppercase ${c.bg} ${c.text}`}>
            {c.label}
        </span>
    );
}

function TabButton({ active, onClick, count, color, children }: {
    active: boolean; onClick: () => void; count: number;
    color: "red" | "primary"; children: React.ReactNode;
}) {
    const activeColors = {
        red: "border-b-2 border-[#ff7351] text-[#ff7351] bg-[#ff7351]/5",
        primary: "border-b-2 border-[#cafd00] text-[#cafd00] bg-[#cafd00]/5",
    };
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-6 py-4 font-arcade text-lg uppercase tracking-widest transition-all ${active ? activeColors[color] : "text-[#717584] hover:text-[#a7aabb] border-b-2 border-transparent"}`}
        >
            {children}
            <span className={`text-xs font-label px-1.5 py-0.5 ${active ? (color === "red" ? "bg-[#ff7351]/20 text-[#ff7351]" : "bg-[#cafd00]/20 text-[#cafd00]") : "bg-[#1a1f2f] text-[#717584]"}`}>
                {count}
            </span>
        </button>
    );
}

// ─── BUGS PANEL ──────────────────────────────────────────────────────────────

function BugsPanel({ bugs }: { bugs: Bug[] }) {
    if (bugs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <span className="font-arcade text-6xl text-[#cafd00]">✓</span>
                <p className="font-arcade text-2xl text-[#cafd00] uppercase tracking-widest">NO BUGS DETECTED</p>
                <p className="text-[#717584] text-sm font-body">All tests passed cleanly.</p>
            </div>
        );
    }
    return (
        <div className="space-y-4">
            <p className="text-[#717584] text-xs font-mono uppercase tracking-widest">
                {bugs.length} confirmed bug{bugs.length !== 1 ? "s" : ""} — sorted by confidence
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
        HIGH: { border: "border-l-[#ff7351]", bg: "bg-[#ff7351]/5", badge: "bg-[#ff7351]/20 text-[#ff7351] border border-[#ff7351]/40" },
        MEDIUM: { border: "border-l-[#fc8700]", bg: "bg-[#fc8700]/5", badge: "bg-[#fc8700]/20 text-[#fc8700] border border-[#fc8700]/40" },
        LOW: { border: "border-l-[#717584]", bg: "bg-[#717584]/5", badge: "bg-[#717584]/20 text-[#a7aabb] border border-[#717584]/40" },
    };
    const c = confidenceConfig[bug.confidence] ?? confidenceConfig.LOW;

    return (
        <div
            className={`border-l-4 ${c.border} ${c.bg} bg-[#141928] border border-[#1a1f2f] border-l-0 animate-fade-in-up`}
            style={{ animationDelay: `${(index - 1) * 60}ms` }}
        >
            {/* Card header */}
            <div className="px-5 pt-4 pb-3">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-arcade text-[#717584] text-sm">#{String(index).padStart(2, "0")}</span>
                        <span className={`font-arcade text-sm uppercase px-2 py-0.5 ${c.badge}`}>
                            {bug.confidence} CONFIDENCE
                        </span>
                        {bug.affectedLayer && (
                            <span className="font-label text-[10px] uppercase tracking-wider px-2 py-0.5 bg-[#1a1f2f] text-[#a7aabb] border border-[#444756]/40">
                                {formatAffectedLayer(bug.affectedLayer)}
                            </span>
                        )}
                    </div>
                    {bug.sourceFile && (
                        <code className="text-[#717584] text-[10px] font-mono shrink-0 mt-0.5">{bug.sourceFile}</code>
                    )}
                </div>

                <h3 className="text-[#e2e4f6] font-display font-bold text-lg leading-snug mb-2">
                    {bug.message}
                </h3>

                {bug.rootCause && (
                    <p className="text-[#a7aabb] text-sm font-body leading-relaxed mb-2">
                        <span className="text-[#fc8700] font-semibold">Root Cause: </span>{bug.rootCause}
                    </p>
                )}

                {bug.testFile && (
                    <p className="text-[#717584] text-[11px] font-mono">
                        Detected by: <span className="text-[#a7aabb]">{bug.testFile}</span>
                        {bug.testName && <span className="text-[#717584]"> → {bug.testName}</span>}
                    </p>
                )}
            </div>

            {/* Suggested fixes accordion */}
            {fixes.length > 0 && (
                <div className="border-t border-[#1a1f2f]">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#1a1f2f]/50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-[#fc8700]" />
                            <span className="font-arcade text-sm text-[#fc8700] uppercase tracking-wider">
                                Suggested Fixes
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#fc8700]/20 text-[#fc8700] font-label">
                                {fixes.length}
                            </span>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-[#717584] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[8000px] opacity-100" : "max-h-0 opacity-0"}`}>
                        <div className="px-5 pb-5 space-y-5">
                            {fixes.map((fix, fi) => (
                                <div key={`${fix.filePath}-${fi}`} className="space-y-3">
                                    <div className="flex items-center gap-2 pt-3">
                                        {fix.type === "modify"
                                            ? <FileEdit className="w-3.5 h-3.5 text-[#a7aabb]" />
                                            : <Sparkles className="w-3.5 h-3.5 text-[#a7aabb]" />}
                                        <span className="text-[10px] uppercase tracking-wider text-[#a7aabb] font-label">
                                            {fix.type === "modify" ? "Modify" : "New File"}
                                        </span>
                                        <code className="text-[10px] font-mono text-[#f3ffca] bg-[#1a1f2f] px-2 py-0.5">
                                            {fix.filePath}
                                        </code>
                                    </div>

                                    <div className={`grid gap-3 ${fix.existingSnippet ? "md:grid-cols-2" : "grid-cols-1"}`}>
                                        {fix.existingSnippet && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <div className="w-1 h-3 bg-[#ff7351]" />
                                                    <span className="text-[10px] text-[#ff7351] font-label uppercase tracking-wider">Before</span>
                                                </div>
                                                <div className="border border-[#ff7351]/20 bg-[#ff7351]/5 overflow-hidden">
                                                    <div className="bg-[#ff7351]/10 px-3 py-1 border-b border-[#ff7351]/20">
                                                        <span className="text-[10px] text-[#ff7351] font-mono">current code</span>
                                                    </div>
                                                    <div className="p-3">
                                                        <CodeBlock code={fix.existingSnippet} language="javascript" showCopyButton={true} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <div className="w-1 h-3 bg-[#cafd00]" />
                                                <span className="text-[10px] text-[#cafd00] font-label uppercase tracking-wider">
                                                    {fix.type === "modify" ? "After" : "New Content"}
                                                </span>
                                            </div>
                                            <div className="border border-[#cafd00]/20 bg-[#cafd00]/5 overflow-hidden">
                                                <div className="bg-[#cafd00]/10 px-3 py-1 border-b border-[#cafd00]/20">
                                                    <span className="text-[10px] text-[#cafd00] font-mono">suggested fix</span>
                                                </div>
                                                <div className="p-3">
                                                    <CodeBlock code={fix.updatedSnippet} language="javascript" showCopyButton={true} />
                                                </div>
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
    const backendPass = backendTests.filter(t => t.status === "PASS").length;
    const backendFail = backendTests.filter(t => t.status !== "PASS").length;
    const browserPass = fullStackTests.filter(t => t.status === "PASS").length;
    const browserFail = fullStackTests.filter(t => t.status !== "PASS").length;

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
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <p className="font-arcade text-2xl text-[#717584] uppercase tracking-widest">NO TESTS RECORDED</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Filter tabs + coverage */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    {(["all", "passed", "failed"] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-1.5 font-arcade text-sm uppercase tracking-wider transition-all ${filter === f
                                ? f === "passed" ? "bg-[#cafd00] text-[#000000]"
                                    : f === "failed" ? "bg-[#ff7351] text-[#000000]"
                                        : "bg-[#f3ffca] text-[#000000]"
                                : "bg-[#1a1f2f] text-[#717584] hover:text-[#a7aabb]"}`}
                        >
                            {f} ({f === "all" ? tests.length : f === "passed" ? tests.filter(t => t.status === "PASS").length : tests.filter(t => t.status !== "PASS").length})
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-4 text-[10px] font-mono text-[#717584] uppercase">
                    {fullStackTests.length > 0 && (
                        <span className={browserFail > 0 ? "text-[#fc8700]" : "text-[#cafd00]/70"}>
                            Browser: {browserPass}✓ {browserFail}✗
                        </span>
                    )}
                    {backendTests.length > 0 && (
                        <span className={backendFail > 0 ? "text-[#fc8700]" : "text-[#cafd00]/70"}>
                            API: {backendPass}✓ {backendFail}✗
                        </span>
                    )}
                </div>
            </div>

            {/* Browser edge cases */}
            {Array.from(fullStackByFeature.entries()).map(([featureName, featureTests]) => (
                <div key={featureName} className="border border-[#1a1f2f] bg-[#141928]">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1a1f2f] bg-[#0e1320]">
                        <span className="font-arcade text-xs text-[#fc8700] uppercase px-1.5 py-0.5 border border-[#fc8700]/30 bg-[#fc8700]/10">Browser</span>
                        <span className="text-[#e2e4f6] font-display font-semibold text-sm">{featureName}</span>
                        <span className="text-[#717584] text-xs font-mono ml-auto">
                            {featureTests.length} case{featureTests.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                    <div className="divide-y divide-[#1a1f2f]">
                        {featureTests.map(test => (
                            <BrowserEdgeCaseRow key={test.id} test={test} />
                        ))}
                    </div>
                </div>
            ))}

            {/* API test files */}
            {filteredBackend.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <span className="font-arcade text-xs text-[#f3ffca] uppercase px-1.5 py-0.5 border border-[#f3ffca]/30 bg-[#f3ffca]/10">API Tests</span>
                        <span className="text-[#717584] text-xs font-mono">{filteredBackend.length} file{filteredBackend.length !== 1 ? "s" : ""}</span>
                    </div>
                    {filteredBackend.map(test => (
                        <TestCard key={test.id} test={test} />
                    ))}
                </div>
            )}
        </div>
    );
}

function BrowserEdgeCaseRow({ test }: { test: Test }) {
    const steps = parseSteps(test.steps);
    const networkAssertions = parseNetworkAssertions(test.networkAssertions);
    const uiAssertions = parseUiAssertions(test.uiAssertions);

    const statusConfig = {
        PASS: { dot: "bg-[#cafd00]", text: "text-[#cafd00]", label: "PASS", glow: "shadow-[0_0_6px_#cafd00]" },
        FAIL: { dot: "bg-[#ff7351]", text: "text-[#ff7351]", label: "FAIL", glow: "shadow-[0_0_6px_#ff7351]" },
        ERROR: { dot: "bg-[#fc8700]", text: "text-[#fc8700]", label: "ERR", glow: "shadow-[0_0_6px_#fc8700]" },
    } as const;
    const c = statusConfig[test.status] ?? statusConfig.FAIL;

    return (
        <div className="px-4 py-3">
            <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${c.dot} ${c.glow}`} />
                    <span className={`font-arcade text-xs uppercase ${c.text}`}>{c.label}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[#e2e4f6] text-sm font-medium leading-tight">{test.testName}</p>
                    <p className="text-[#717584] text-[10px] font-mono mt-0.5 truncate">{test.testFile}</p>
                    {steps.length > 0 && (
                        <p className="text-[#a7aabb] text-[10px] mt-1.5 flex items-center gap-1 flex-wrap">
                            {steps.map((s, i) => (
                                <span key={i} className="flex items-center gap-1">
                                    {i > 0 && <ChevronRight className="w-2.5 h-2.5 text-[#444756]" />}
                                    <span>{s}</span>
                                </span>
                            ))}
                        </p>
                    )}
                </div>
                {test.screenshotUrl && (
                    <Dialog>
                        <DialogTrigger asChild>
                            <button className="shrink-0 w-20 h-14 border border-[#1a1f2f] hover:border-[#f3ffca]/30 overflow-hidden transition-colors">
                                <img src={test.screenshotUrl} alt={test.testName} className="w-full h-full object-cover" />
                            </button>
                        </DialogTrigger>
                        <DialogContent className="!w-[80vw] !max-w-none h-[80vh] p-1 !bg-[#0a0e1a] border-2 border-[#f3ffca]/20 overflow-hidden">
                            <DialogTitle className="sr-only">{test.testName} screenshot</DialogTitle>
                            <img src={test.screenshotUrl} alt="full screenshot" className="w-full h-full object-contain" />
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {(networkAssertions.length > 0 || uiAssertions.length > 0 || test.output) && (
                <div className="mt-2 ml-[4.5rem] space-y-1">
                    {networkAssertions.map((a, i) => (
                        <p key={i} className="text-[10px] font-mono text-[#a7aabb]">
                            <span className="text-[#717584]">Network:</span> {a.method.toUpperCase()} {a.url} →{" "}
                            <span className={a.passed ? "text-[#cafd00]" : "text-[#ff7351]"}>
                                {a.actualStatus} {a.passed ? "✓" : "✗"}
                            </span>
                        </p>
                    ))}
                    {uiAssertions.map((a, i) => (
                        <p key={i} className="text-[10px] font-mono text-[#a7aabb]">
                            <span className="text-[#717584]">UI:</span> {a.selector} →{" "}
                            <span className={a.passed ? "text-[#cafd00]" : "text-[#ff7351]"}>
                                {a.passed ? "✓" : `expected "${a.expected}" got "${a.actual}"`}
                            </span>
                        </p>
                    ))}
                    {test.output && !networkAssertions.length && !uiAssertions.length && (
                        <p className="text-[10px] font-mono text-[#717584] line-clamp-2">{test.output}</p>
                    )}
                </div>
            )}
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
        PASS: { dot: "bg-[#cafd00]", text: "text-[#cafd00]", label: "PASS", glow: "shadow-[0_0_6px_#cafd00]", border: "border-l-[#cafd00]" },
        FAIL: { dot: "bg-[#ff7351]", text: "text-[#ff7351]", label: "FAIL", glow: "shadow-[0_0_6px_#ff7351]", border: "border-l-[#ff7351]" },
        ERROR: { dot: "bg-[#fc8700]", text: "text-[#fc8700]", label: "ERR", glow: "shadow-[0_0_6px_#fc8700]", border: "border-l-[#fc8700]" },
    } as const;
    const c = statusConfig[test.status as keyof typeof statusConfig] ?? statusConfig.FAIL;

    return (
        <div className={`border border-[#1a1f2f] border-l-2 ${c.border} bg-[#141928]`}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1f2f]/40 transition-colors text-left"
            >
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot} ${c.glow}`} />
                <span className={`font-arcade text-xs uppercase tracking-wider ${c.text} shrink-0`}>{c.label}</span>
                <div className="flex-1 min-w-0">
                    <p className="text-[#e2e4f6] text-sm font-mono truncate">{test.testFile}</p>
                    <p className="text-[#a7aabb] text-xs font-body truncate">{test.testName}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-[#717584] transition-transform duration-300 shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
            </button>

            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`}>
                <div className="px-4 pb-4 space-y-3 border-t border-[#1a1f2f] pt-3">
                    {test.output && (
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className="w-1 h-3 bg-[#f3ffca]/50" />
                                <span className="text-[10px] text-[#a7aabb] font-label uppercase tracking-wider">Console Output</span>
                            </div>
                            <div className="bg-[#000000] border border-[#1a1f2f] overflow-hidden">
                                <div className="bg-[#0e1320] px-3 py-1 border-b border-[#1a1f2f]">
                                    <span className="text-[10px] text-[#717584] font-mono">stderr/stdout</span>
                                </div>
                                <div className="p-3">
                                    <CodeBlock code={test.output} language="bash" showCopyButton={false} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-1 h-3 bg-[#cafd00]" />
                            <span className="text-[10px] text-[#cafd00] font-label uppercase tracking-wider">Test Code</span>
                        </div>
                        <div className="bg-[#000000] border border-[#cafd00]/20 overflow-hidden">
                            <div className="bg-[#cafd00]/10 px-3 py-1.5 border-b border-[#cafd00]/20 flex items-center justify-between">
                                <span className="text-[10px] text-[#cafd00] font-mono">{test.testFile.split("/").pop()}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                                    className="text-[10px] text-[#cafd00]/70 hover:text-[#cafd00] flex items-center gap-1 transition-colors font-label uppercase tracking-wider"
                                >
                                    ↓ Download
                                </button>
                            </div>
                            <div className="p-3">
                                <CodeBlock code={test.fileContent} language="javascript" showCopyButton={true} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Loading / Cancelled / NotFound States ───────────────────────────────────

const FUNNY_MESSAGES = [
    "DEPLOYING SENTINELS INTO THE CODEBASE...",
    "TEACHING AI TO READ YOUR MIND (AND YOUR BUGS)...",
    "SCANNING FOR SUSPICIOUS VARIABLES...",
    "CALIBRATING SARCASM LEVELS...",
    "NEGOTIATING WITH THE DATABASE...",
    "SUMMONING THE DEBUGGING SPIRITS...",
    "JUDGING YOUR VARIABLE NAMES...",
    "ANALYZING LIFE CHOICES, ONE LINE AT A TIME...",
    "CONVINCING BUGS TO REVEAL THEMSELVES...",
    "ASKING STACK OVERFLOW FOR HELP...",
    "BLAMING THE PREVIOUS DEVELOPER...",
    "RETICULATING SPLINES...",
    "CHANNELING SENIOR DEV ENERGY...",
    "NEURAL NETWORKS GOSSIPING ABOUT YOUR PROJECT...",
    "CALCULATING PROBABILITY OF YOU BEING WRONG...",
    "PRETENDING TO UNDERSTAND ASYNC/AWAIT...",
    "GHOSTS OF BUGS PAST HAVE BEEN SUMMONED...",
    "DEPLOYING TINY ROBOTS THROUGH YOUR FUNCTIONS...",
];

const STATUS_LABELS: Record<string, string> = {
    PENDING: "QUEUED_FOR_ANALYSIS",
    ANALYZING: "SCANNING_CODEBASE",
    SETTING_UP: "INITIALIZING_SANDBOX",
    TESTING: "EXECUTING_TEST_SUITE",
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

    const statusLabel = STATUS_LABELS[status] ?? "PROCESSING";
    const dotsStr = ".".repeat(dots);

    return (
        <div className="min-h-screen bg-[#0a0e1a] flex flex-col arcade-grid">
            <Navbar />
            {/* Back button */}
            <div className="fixed top-14 left-6 z-20">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-[#a7aabb] hover:text-[#f3ffca] text-xs uppercase tracking-widest font-label transition-colors group"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span>
                    Back
                </button>
            </div>

            {/* Center content */}
            <div className="flex-1 flex items-center justify-center px-8">
                <div className="w-full max-w-2xl">

                    {/* Status label */}
                    <p className="font-arcade text-[#fc8700] text-2xl uppercase tracking-[0.3em] mb-2 text-center">
                        {statusLabel}{dotsStr}
                    </p>

                    {/* Scan line animation */}
                    <div className="relative h-1 bg-[#1a1f2f] mb-12 overflow-hidden">
                        <div
                            className="absolute top-0 left-0 h-full bg-[#cafd00]"
                            style={{ animation: "scanLine 2s ease-in-out infinite" }}
                        />
                    </div>

                    {/* Funny message */}
                    <div className="relative h-20 flex items-center justify-center mb-12">
                        <p
                            className={`font-arcade text-3xl text-[#f3ffca] text-center uppercase leading-tight transition-all duration-400 ${fading ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}
                        >
                            {FUNNY_MESSAGES[msgIdx]}
                        </p>
                    </div>

                    {/* Pixel dots loader */}
                    <div className="flex items-center justify-center gap-3 mb-12">
                        {[0, 1, 2, 3, 4, 5, 6].map(i => (
                            <div
                                key={i}
                                className="w-2 h-2 bg-[#cafd00]"
                                style={{
                                    animation: `pixelBlink 1.4s ease-in-out ${i * 0.2}s infinite`,
                                    opacity: 0.3,
                                }}
                            />
                        ))}
                    </div>

                    {/* Cancel button */}
                    <div className="flex justify-center">
                        <button
                            onClick={onCancel}
                            disabled={isCancelling}
                            className="px-6 py-2 bg-[#ff7351]/10 border border-[#ff7351]/40 text-[#ff7351] font-arcade uppercase tracking-widest text-sm hover:bg-[#ff7351]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-[3px_3px_0px_0px_rgba(255,115,81,0.3)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        >
                            {isCancelling ? "ABORTING..." : "ABORT_MISSION"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Inline keyframes for loading animations */}
            <style>{`
                @keyframes scanLine {
                    0% { width: 0%; left: 0; }
                    50% { width: 100%; left: 0; }
                    100% { width: 0%; left: 100%; }
                }
                @keyframes pixelBlink {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
                    40% { opacity: 1; transform: scale(1.4); background-color: #f3ffca; }
                }
            `}</style>
        </div>
    );
}

function CancelledState({ backHref }: { backHref: string }) {
    return (
        <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6 arcade-grid">
            <Navbar />
            <div className="text-center max-w-md pt-12">
                <p className="font-arcade text-8xl text-[#ff7351] mb-4">✗</p>
                <h2 className="font-arcade text-4xl text-[#f3ffca] uppercase tracking-widest mb-3">MISSION_ABORTED</h2>
                <p className="text-[#a7aabb] font-body text-sm mb-8">This run was cancelled before completion.</p>
                <a
                    href={backHref}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#f3ffca] text-[#0a0e1a] font-arcade uppercase tracking-widest text-sm shadow-[4px_4px_0px_0px_rgba(202,253,0,0.4)] hover:shadow-[2px_2px_0px_0px_rgba(202,253,0,0.4)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                    ← Return to Base
                </a>
            </div>
        </div>
    );
}

function NotFoundState() {
    return (
        <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
            <Navbar />
            <div className="text-center pt-12">
                <p className="font-arcade text-6xl text-[#717584] mb-4">404</p>
                <p className="font-arcade text-2xl text-[#a7aabb] uppercase">MISSION_NOT_FOUND</p>
                <p className="text-[#717584] text-sm mt-2 font-body">This test job does not exist or has been deleted.</p>
            </div>
        </div>
    );
}
