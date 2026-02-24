"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CodeBlock } from "@/components/code-block";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, FileEdit, Sparkles } from "lucide-react";

// Type guard for suggested fixes
function parseSuggestedFixes(fixes: unknown): SuggestedFix[] {
    if (!fixes || !Array.isArray(fixes)) return [];
    return fixes.filter((fix): fix is SuggestedFix => {
        return (
            typeof fix === "object" &&
            fix !== null &&
            "type" in fix &&
            "filePath" in fix &&
            "updatedSnippet" in fix &&
            (fix.type === "modify" || fix.type === "new") &&
            typeof fix.filePath === "string" &&
            typeof fix.updatedSnippet === "string"
        );
    });
}

// Type definitions
type JobStatus = "PENDING" | "ANALYZING" | "SETTING_UP" | "TESTING" | "COMPLETED" | "FAILED";
type TestStatus = "PASS" | "FAIL" | "ERROR";
type BugConfidence = "LOW" | "MEDIUM" | "HIGH";

interface Repository {
    id: string;
    repoOwner: string;
    repoName: string;
    repoUrl: string;
}

interface Test {
    id: string;
    testFile: string;
    testName: string;
    fileContent: string;
    status: TestStatus;
    exitCode: number | null;
    output: string | null;
    executedAt: Date | null;
}

interface SuggestedFix {
    type: "modify" | "new";
    filePath: string;
    existingSnippet?: string;
    updatedSnippet: string;
}

interface Bug {
    id: string;
    message: string;
    rootCause: string | null;
    sourceFile: string | null;
    confidence: BugConfidence;
    testFile: string | null;
    testName: string | null;
    suggestedFixes?: unknown;
}

interface DiscoveryInfo {
    framework?: string;
    entryPoint?: string;
    moduleType?: string;
    databaseUsed?: boolean;
    endpoints?: Array<{
        method: string;
        path: string;
        file: string;
    }>;
    envVarsNeeded?: string[];
}

interface ServerInfo {
    port?: number;
    sandboxUrl?: string;
    startCommand?: string;
    isRunning?: boolean;
}

export default function TestResultsPage() {
    const params = useParams();
    const jobId = params.jobId as string;
    const trpc = useTRPC();

    // Poll every 2s if job is still running
    const { data: job, isLoading, isFetching, isError, error } = useQuery(
        trpc.jobs.getById.queryOptions(
            { id: jobId },
            {
                refetchInterval: (query) => {
                    const data = query.state.data;
                    if (
                        data?.status &&
                        ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(data.status)
                    ) {
                        return 2000;
                    }
                    return false;
                },
            }
        )
    );

    if (isLoading || isFetching) {
        return <LoadingState />;
    }

    if (isError) {
        const code = (error as { data?: { code?: string } } | undefined)?.data?.code;
        if (code === "NOT_FOUND") {
            return (
                <div className="min-h-screen flex items-center justify-center">
                    <Card className="p-8 text-center">
                        <h2 className="text-2xl font-bold mb-2">Job not found</h2>
                        <p className="text-muted-foreground">This test job does not exist or has been deleted.</p>
                    </Card>
                </div>
            );
        }
        return <LoadingState />;
    }

    if (!job) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Card className="p-8 text-center">
                    <h2 className="text-2xl font-bold mb-2">Job not found</h2>
                    <p className="text-muted-foreground">This test job does not exist or has been deleted.</p>
                </Card>
            </div>
        );
    }

    const isActive = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(job.status);

    if (isActive) {
        return <LoadingState />;
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="bg-card border-b">
                <div className="container mx-auto px-6 py-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">
                                {job.repository.repoOwner}/{job.repository.repoName}
                            </h1>
                            <a
                                href={job.repository.repoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline"
                            >
                                {job.repository.repoUrl}
                            </a>
                        </div>
                        <StatusBadge status={job.status} />
                    </div>
                    <p className="text-card-foreground line-clamp-2">{job.bugDescription}</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-6 py-8 space-y-6">
                {/* Summary Overview */}
                <Card className="p-6">
                    <h2 className="text-xl font-bold mb-4">Test Results Overview</h2>

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-muted rounded-lg p-4">
                            <div className="text-sm text-muted-foreground mb-1">Total Tests</div>
                            <div className="text-2xl font-bold">{job.tests.length}</div>
                        </div>
                        <div className="bg-chart-2/10 rounded-lg p-4">
                            <div className="text-sm text-chart-2 mb-1">Passed</div>
                            <div className="text-2xl font-bold text-chart-2">
                                {job.tests.filter(t => t.status === 'PASS').length}
                            </div>
                        </div>
                        <div className="bg-destructive/10 rounded-lg p-4">
                            <div className="text-sm text-destructive mb-1">Failed</div>
                            <div className="text-2xl font-bold text-destructive">
                                {job.tests.filter(t => t.status === 'FAIL').length}
                            </div>
                        </div>
                    </div>

                    {/* Bugs Summary */}
                    {job.bugs.length > 0 && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm font-semibold text-card-foreground">Confirmed Bugs:</span>
                                <Badge variant="destructive">{job.bugs.length}</Badge>
                            </div>
                            <div className="space-y-2">
                                {job.bugs.map((bug, index) => (
                                    <div key={bug.id} className="text-sm text-card-foreground">
                                        <span className="font-medium">{index + 1}. {bug.message}</span>
                                        {bug.sourceFile && (
                                            <span className="text-muted-foreground"> - {bug.sourceFile}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI Summary */}
                    {job.summary && (
                        <div className="border-t pt-4">
                            <div className="text-sm font-semibold text-card-foreground mb-2">Analysis Summary</div>
                            <p className="text-card-foreground leading-relaxed">
                                {job.summary.replace(/<task_summary>/gi, '').replace(/<\/task_summary>/gi, '').replace(/\\n/g, ' ').trim()}
                            </p>
                        </div>
                    )}

                    {/* Technical Details */}
                    {job.discoveryInfo && Object.keys(job.discoveryInfo).length > 0 && (() => {
                        const discoveryInfo = job.discoveryInfo as DiscoveryInfo;
                        return (
                            <div className="border-t pt-4 mt-4">
                                <div className="text-sm font-semibold text-card-foreground mb-3">Technical Details</div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    {discoveryInfo.framework && (
                                        <div>
                                            <span className="text-muted-foreground">Framework:</span>{' '}
                                            <span className="font-medium">{discoveryInfo.framework}</span>
                                        </div>
                                    )}
                                    {discoveryInfo.entryPoint && (
                                        <div>
                                            <span className="text-muted-foreground">Entry Point:</span>{' '}
                                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                {discoveryInfo.entryPoint}
                                            </code>
                                        </div>
                                    )}
                                    {discoveryInfo.moduleType && (
                                        <div>
                                            <span className="text-muted-foreground">Module Type:</span>{' '}
                                            <span className="font-medium">{discoveryInfo.moduleType}</span>
                                        </div>
                                    )}
                                    {discoveryInfo.databaseUsed !== undefined && (
                                        <div>
                                            <span className="text-muted-foreground">Database:</span>{' '}
                                            <span className="font-medium">
                                                {discoveryInfo.databaseUsed ? 'Yes' : 'No'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </Card>

                {/* Bugs Section */}
                {job.bugs.length > 0 && (
                    <Card className="p-6">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            Detailed Bug Reports
                            <Badge variant="destructive">{job.bugs.length}</Badge>
                        </h2>
                        <div className="space-y-4">
                            {job.bugs.map((bug) => (
                                <BugCard key={bug.id} bug={bug} />
                            ))}
                        </div>
                    </Card>
                )}

                {/* Tests Section */}
                {job.tests.length > 0 && (
                    <Card className="p-6">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            Tests
                            <Badge>{job.tests.length}</Badge>
                        </h2>

                        <Tabs defaultValue="all">
                            <TabsList>
                                <TabsTrigger value="all">
                                    All ({job.tests.length})
                                </TabsTrigger>
                                <TabsTrigger value="failed">
                                    Failed ({job.tests.filter((t) => t.status === "FAIL").length})
                                </TabsTrigger>
                                <TabsTrigger value="passed">
                                    Passed ({job.tests.filter((t) => t.status === "PASS").length})
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="all" className="space-y-4 mt-4">
                                {job.tests.map((test) => (
                                    <TestCard key={test.id} test={test} />
                                ))}
                            </TabsContent>

                            <TabsContent value="failed" className="space-y-4 mt-4">
                                {job.tests
                                    .filter((t) => t.status === "FAIL")
                                    .map((test) => (
                                        <TestCard key={test.id} test={test} />
                                    ))}
                            </TabsContent>

                            <TabsContent value="passed" className="space-y-4 mt-4">
                                {job.tests
                                    .filter((t) => t.status === "PASS")
                                    .map((test) => (
                                        <TestCard key={test.id} test={test} />
                                    ))}
                            </TabsContent>
                        </Tabs>
                    </Card>
                )}

                {/* Empty State */}
                {job.tests.length === 0 && job.status === "COMPLETED" && (
                    <Card className="p-8 text-center">
                        <p className="text-muted-foreground">No tests were generated for this job.</p>
                    </Card>
                )}
            </div>
        </div>
    );
}

function LoadingState() {
    const funnyMessages = [
        "AI pretending it knows better than you...",
        "Teaching robots to critique humans...",
        "Generating helpful suggestions (results may vary)...",
        "Calibrating sarcasm levels...",
        "Translating engineer tears into feedback...",
        "Loading existential dread about your code...",
        "Teaching robots to find your bugs...",
        "Judging your variable names...",
        "Summoning the debugging spirits...",
        "Calculating the probability of you being wrong...",
        "Asking Stack Overflow for help...",
        "Blaming the previous developer...",
        "Consulting the ancient scrolls...",
        "Convincing bugs to reveal themselves...",
        "Pretending to understand async/await...",
        "Negotiating with the database...",
        "Reticulating splines...",
        "Analyzing your life choices, one line at a time...",
        "Decoding the mysteries of your logic...",
        "Channeling the spirit of senior developers...",
        "Preparing passive-aggressive comments...",
        "Neural networks are gossiping about your project...",
        "Summoning the ghosts of bugs past...",
    ];

    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsTransitioning(true);
            // Wait for fade-out to complete before changing message
            setTimeout(() => {
                setCurrentMessageIndex((prev) => (prev + 1) % funnyMessages.length);
                setIsTransitioning(false);
            }, 400); // 400ms = half of 800ms animation
        }, 4000); // Change message every 4 seconds

        return () => clearInterval(interval);
    }, [funnyMessages.length]);

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="relative w-full max-w-2xl px-8">
                <div className="relative min-h-32 flex items-center justify-center">
                    {/* Funny message with transition */}
                    <div
                        key={currentMessageIndex}
                        className={`absolute text-2xl font-medium text-foreground text-center transition-all duration-800 ${
                            isTransitioning ? "animate-fade-up" : "animate-fade-in-up animate-subtle-pulse"
                        }`}
                    >
                        {funnyMessages[currentMessageIndex]}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { bg: string; text: string }> = {
        PENDING: { bg: "bg-muted", text: "text-muted-foreground" },
        ANALYZING: { bg: "bg-chart-2/20", text: "text-chart-2" },
        SETTING_UP: { bg: "bg-chart-3/20", text: "text-chart-3" },
        TESTING: { bg: "bg-chart-4/20", text: "text-chart-4" },
        COMPLETED: { bg: "bg-chart-2/20", text: "text-chart-2" },
        FAILED: { bg: "bg-destructive/20", text: "text-destructive" },
    };

    const variant = variants[status] || variants.PENDING;

    return (
        <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${variant.bg} ${variant.text}`}
        >
            {status}
        </span>
    );
}

function BugCard({ bug }: { bug: Bug }) {
    const confidenceColors = {
        HIGH: "border-destructive bg-destructive/10",
        MEDIUM: "border-chart-3 bg-chart-3/10",
        LOW: "border-muted-foreground bg-muted",
    };
    const [isExpanded, setIsExpanded] = useState(false);
    const fixes = parseSuggestedFixes(bug.suggestedFixes);

    return (
        <Card className={`p-4 border-l-4 ${confidenceColors[bug.confidence as keyof typeof confidenceColors]}`}>
            <div className="flex items-start justify-between mb-2">
                <Badge variant="destructive">{bug.confidence} CONFIDENCE</Badge>
                {bug.sourceFile && (
                    <span className="text-xs text-muted-foreground font-mono">{bug.sourceFile}</span>
                )}
            </div>

            <h3 className="font-semibold text-lg mb-2">{bug.message}</h3>

            {bug.rootCause && (
                <p className="text-sm text-card-foreground mb-3">
                    <strong>Root Cause:</strong> {bug.rootCause}
                </p>
            )}

            {bug.testFile && (
                <p className="text-xs text-muted-foreground">
                    Found by: <span className="font-mono">{bug.testFile}</span>
                    {bug.testName && <> → {bug.testName}</>}
                </p>
            )}

            {fixes.length > 0 && (
                <div className="mt-4 border-t pt-4">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-card-foreground">Suggested Fixes</span>
                            <Badge variant="secondary" className="text-xs">{fixes.length}</Badge>
                        </div>
                        <ChevronDown
                            className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                    </button>

                    <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                            isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                        }`}
                    >
                        <div className="mt-4 space-y-6">
                            {fixes.map((fix, index) => (
                                <div
                                    key={`${fix.filePath}-${index}`}
                                    className="space-y-4 p-4 rounded-lg border border-border bg-card/50"
                                    style={{
                                        animationDelay: `${index * 50}ms`,
                                        animation: isExpanded ? 'slideIn 0.3s ease-out forwards' : 'none'
                                    }}
                                >
                                    <div className="flex items-center gap-2 pb-3 border-b border-border">
                                        <Badge
                                            variant={fix.type === "modify" ? "default" : "secondary"}
                                            className="capitalize font-medium flex items-center gap-1.5"
                                        >
                                            {fix.type === "modify" ? (
                                                <>
                                                    <FileEdit className="w-3 h-3" />
                                                    Modify
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="w-3 h-3" />
                                                    New File
                                                </>
                                            )}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                                            {fix.filePath}
                                        </span>
                                    </div>

                                    <div className="grid gap-4">
                                        {fix.type === "modify" && fix.existingSnippet && (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1 h-4 bg-destructive rounded-full"></div>
                                                    <span className="text-xs font-semibold text-destructive uppercase tracking-wide">
                                                        Current Code
                                                    </span>
                                                </div>
                                                <div className="bg-destructive/5 border-2 border-destructive/30 rounded-lg overflow-hidden">
                                                    <div className="bg-destructive/10 px-3 py-1.5 border-b border-destructive/30">
                                                        <span className="text-xs text-destructive font-medium">Before</span>
                                                    </div>
                                                    <div className="p-3">
                                                        <CodeBlock
                                                            code={fix.existingSnippet}
                                                            language="javascript"
                                                            showCopyButton={true}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-4 bg-chart-2 rounded-full"></div>
                                                <span className="text-xs font-semibold text-chart-2 uppercase tracking-wide">
                                                    {fix.type === "modify" ? "Suggested Fix" : "New File Content"}
                                                </span>
                                            </div>
                                            <div className="bg-chart-2/5 border-2 border-chart-2/30 rounded-lg overflow-hidden">
                                                <div className="bg-chart-2/10 px-3 py-1.5 border-b border-chart-2/30">
                                                    <span className="text-xs text-chart-2 font-medium">
                                                        {fix.type === "modify" ? "After" : "Content"}
                                                    </span>
                                                </div>
                                                <div className="p-3">
                                                    <CodeBlock
                                                        code={fix.updatedSnippet}
                                                        language="javascript"
                                                        showCopyButton={true}
                                                    />
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
        </Card>
    );
}

function TestCard({ test }: { test: Test }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleDownload = () => {
        const blob = new Blob([test.fileContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = test.testFile.split("/").pop() || "test.js";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Test file downloaded");
    };

    const statusConfig = {
        PASS: {
            color: "bg-chart-2/20 text-chart-2 border-chart-2",
            icon: CheckCircle2,
        },
        FAIL: {
            color: "bg-destructive/20 text-destructive border-destructive",
            icon: XCircle,
        },
        ERROR: {
            color: "bg-chart-1/20 text-chart-1 border-chart-1",
            icon: AlertCircle,
        },
    };

    const config = statusConfig[test.status as keyof typeof statusConfig];
    const StatusIcon = config.icon;

    return (
        <Card className="p-0 overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-4 flex justify-between items-start hover:bg-muted/30 cursor-pointer transition-colors text-left"
            >
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge
                            className={`${config.color} flex items-center gap-1.5`}
                        >
                            <StatusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                            {test.status}
                        </Badge>
                        <span className="font-mono text-sm text-card-foreground">{test.testFile}</span>
                    </div>
                    <p className="text-muted-foreground text-sm">{test.testName}</p>
                </div>

                <ChevronDown
                    className={`w-5 h-5 text-muted-foreground transition-transform duration-300 flex-shrink-0 ml-2 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>

            <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
                }`}
            >
                <div className="px-4 pb-4 space-y-4 border-t">
                    {/* Output */}
                    {test.output && (
                        <div
                            className="pt-4"
                            style={{
                                animation: isExpanded ? 'slideIn 0.3s ease-out forwards' : 'none'
                            }}
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-1 h-4 bg-primary rounded-full"></div>
                                <h4 className="text-xs font-semibold text-primary uppercase tracking-wide">
                                    Test Output
                                </h4>
                            </div>
                            <div className="bg-muted/50 border border-border rounded-lg overflow-hidden">
                                <div className="bg-muted px-3 py-1.5 border-b border-border">
                                    <span className="text-xs text-muted-foreground font-medium">Console</span>
                                </div>
                                <div className="p-3">
                                    <CodeBlock
                                        code={test.output}
                                        language="bash"
                                        showCopyButton={false}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Test Code */}
                    <div
                        style={{
                            animationDelay: test.output ? '50ms' : '0ms',
                            animation: isExpanded ? 'slideIn 0.3s ease-out forwards' : 'none'
                        }}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-1 h-4 bg-chart-2 rounded-full"></div>
                            <h4 className="text-xs font-semibold text-chart-2 uppercase tracking-wide">
                                Test Code
                            </h4>
                        </div>
                        <div className="bg-chart-2/5 border-2 border-chart-2/30 rounded-lg overflow-hidden">
                            <div className="bg-chart-2/10 px-3 py-1.5 border-b border-chart-2/30 flex items-center justify-between">
                                <span className="text-xs text-chart-2 font-medium">
                                    {test.testFile.split("/").pop()}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload();
                                    }}
                                    className="text-xs text-chart-2 hover:text-chart-2/80 transition-colors flex items-center gap-1"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download
                                </button>
                            </div>
                            <div className="p-3">
                                <CodeBlock
                                    code={test.fileContent}
                                    language="javascript"
                                    showCopyButton={true}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
}



