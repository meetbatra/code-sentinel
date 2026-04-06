"use client";

import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CodeBlock } from "@/components/code-block";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, FileEdit, Sparkles, ArrowLeft } from "lucide-react";

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
type TestStatus = "PASS" | "FAIL" | "ERROR";
type BugConfidence = "LOW" | "MEDIUM" | "HIGH";
type TestType = "backend" | "full-stack";

interface NetworkAssertion {
    url: string;
    method: string;
    expectedStatus: number;
    actualStatus: number;
    passed: boolean;
}

interface UiAssertion {
    selector: string;
    expected: string;
    actual: string;
    passed: boolean;
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
    type: string;
    featureName: string | null;
    screenshotUrl: string | null;
    steps: unknown;
    networkAssertions: unknown;
    uiAssertions: unknown;
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
    affectedLayer?: string | null;
}

function parseSteps(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((step): step is string => typeof step === "string");
}

function parseNetworkAssertions(value: unknown): NetworkAssertion[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is NetworkAssertion => {
        return (
            typeof item === "object" &&
            item !== null &&
            "url" in item &&
            "method" in item &&
            "expectedStatus" in item &&
            "actualStatus" in item &&
            "passed" in item &&
            typeof item.url === "string" &&
            typeof item.method === "string" &&
            typeof item.expectedStatus === "number" &&
            typeof item.actualStatus === "number" &&
            typeof item.passed === "boolean"
        );
    });
}

function parseUiAssertions(value: unknown): UiAssertion[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is UiAssertion => {
        return (
            typeof item === "object" &&
            item !== null &&
            "selector" in item &&
            "expected" in item &&
            "actual" in item &&
            "passed" in item &&
            typeof item.selector === "string" &&
            typeof item.expected === "string" &&
            typeof item.actual === "string" &&
            typeof item.passed === "boolean"
        );
    });
}

function isFullStackTest(test: Test): test is Test & { type: TestType } {
    return test.type === "full-stack" || test.type === "FULL_STACK";
}

function formatAffectedLayer(value: string): string {
    if (value === "FRONTEND" || value === "frontend") return "frontend";
    if (value === "BACKEND" || value === "backend") return "backend";
    if (value === "BOTH" || value === "both") return "both";
    return value;
}

interface DiscoveryInfo {
    framework?: string;
    entryPoint?: string;
    moduleType?: string;
    backendFramework?: string;
    frontendFramework?: string;
    backendEntryPoint?: string;
    frontendEntryPoint?: string;
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
    backendPort?: number;
    backendUrl?: string;
    backendStartCommand?: string;
    backendRunning?: boolean;
    frontendPort?: number;
    frontendUrl?: string;
    frontendStartCommand?: string;
    frontendRunning?: boolean;
}

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
                if (!result.success) {
                    setIsOptimisticallyCancelled(false);
                    toast.error(result.message ?? "Unable to cancel run");
                    return;
                }
                toast.success("Run canceled");
            },
            onError: (err) => {
                toast.error(err.message ?? "Failed to cancel run");
            },
        })
    );

    const handleCancel = () => {
        if (cancelRun.isPending || isOptimisticallyCancelled) {
            return;
        }

        setIsOptimisticallyCancelled(true);
        cancelRun.mutate(
            { jobId },
            {
                onError: () => {
                    setIsOptimisticallyCancelled(false);
                },
            }
        );
    };

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

    if (isOptimisticallyCancelled) {
        return <CancelledState backHref={backHref} />;
    }

    if (!job && (isLoading || isFetching)) {
        return (
            <LoadingState
                onBack={() => router.push(backHref)}
                onCancel={handleCancel}
                isCancelling={cancelRun.isPending}
            />
        );
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
        return (
            <LoadingState
                onBack={() => router.push(backHref)}
                onCancel={handleCancel}
                isCancelling={cancelRun.isPending}
            />
        );
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
    const isCancelled =
        isOptimisticallyCancelled ||
        job.status === "FAILED" &&
        (job.summary ?? "").toLowerCase().includes("canceled by user");

    if (isCancelled) {
        return <CancelledState backHref={backHref} />;
    }

    if (isActive) {
        return (
            <LoadingState
                onBack={() => router.push(backHref)}
                onCancel={handleCancel}
                isCancelling={cancelRun.isPending}
            />
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="bg-card border-b">
                <div className="container mx-auto px-6 py-6">
                    <div className="mb-4 flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(backHref)}
                        >
                            <ArrowLeft className="mr-1.5 h-4 w-4" />
                            Back
                        </Button>
                    </div>
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
                            <div className="text-2xl font-bold">{job.totalTests ?? job.tests.length}</div>
                        </div>
                        <div className="bg-chart-2/10 rounded-lg p-4">
                            <div className="text-sm text-chart-2 mb-1">Passed</div>
                            <div className="text-2xl font-bold text-chart-2">
                                {job.passedTests ?? job.tests.filter(t => t.status === 'PASS').length}
                            </div>
                        </div>
                        <div className="bg-destructive/10 rounded-lg p-4">
                            <div className="text-sm text-destructive mb-1">Failed</div>
                            <div className="text-2xl font-bold text-destructive">
                                {(job.failedTests ?? job.tests.filter(t => t.status === 'FAIL').length) + (job.errorTests ?? 0)}
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
                    {((job.discoveryInfo && Object.keys(job.discoveryInfo).length > 0) ||
                        (job.serverInfo && Object.keys(job.serverInfo).length > 0)) && (() => {
                        const discoveryInfo = (job.discoveryInfo || {}) as DiscoveryInfo;
                        const serverInfo = (job.serverInfo || {}) as ServerInfo;
                        const isFullStack = !!(discoveryInfo.frontendFramework || discoveryInfo.frontendEntryPoint || serverInfo.frontendPort);

                        if (!isFullStack) {
                            const details = [];
                            if (discoveryInfo.framework) {
                                details.push(
                                    <div key="fw">
                                        <span className="text-muted-foreground">Framework:</span>{' '}
                                        <span className="font-medium">{discoveryInfo.framework}</span>
                                    </div>
                                );
                            }
                            if (discoveryInfo.databaseUsed !== undefined) {
                                details.push(
                                    <div key="db">
                                        <span className="text-muted-foreground">Database:</span>{' '}
                                        <span className="font-medium">{discoveryInfo.databaseUsed ? 'Yes' : 'No'}</span>
                                    </div>
                                );
                            }
                            if (discoveryInfo.backendFramework) {
                                details.push(
                                    <div key="bfw">
                                        <span className="text-muted-foreground">Backend Framework:</span>{' '}
                                        <span className="font-medium">{discoveryInfo.backendFramework}</span>
                                    </div>
                                );
                            }
                            const entry = discoveryInfo.backendEntryPoint || discoveryInfo.entryPoint;
                            if (entry) {
                                details.push(
                                    <div key="entry">
                                        <span className="text-muted-foreground">Entry Point:</span>{' '}
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{entry}</code>
                                    </div>
                                );
                            }
                            const port = serverInfo.backendPort || serverInfo.port;
                            if (port) {
                                details.push(
                                    <div key="port">
                                        <span className="text-muted-foreground">Port:</span>{' '}
                                        <span className="font-medium">{port}</span>
                                    </div>
                                );
                            }
                            if (discoveryInfo.moduleType) {
                                details.push(
                                    <div key="mod">
                                        <span className="text-muted-foreground">Module Type:</span>{' '}
                                        <span className="font-medium">{discoveryInfo.moduleType}</span>
                                    </div>
                                );
                            }

                            const half = Math.ceil(details.length / 2);
                            const leftCol = details.slice(0, half);
                            const rightCol = details.slice(half);

                            return (
                                <div className="border-t pt-4 mt-4">
                                    <div className="text-sm font-semibold text-card-foreground mb-3">Technical Details</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                        <div className="space-y-3">{leftCol}</div>
                                        <div className="space-y-3">{rightCol}</div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div className="border-t pt-4 mt-4">
                                <div className="text-sm font-semibold text-card-foreground mb-3">Technical Details</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                    {/* Left Column: Framework & Backend */}
                                    <div className="space-y-3">
                                        {discoveryInfo.framework && (
                                            <div>
                                                <span className="text-muted-foreground">Framework:</span>{' '}
                                                <span className="font-medium">{discoveryInfo.framework}</span>
                                            </div>
                                        )}
                                        {discoveryInfo.backendFramework && (
                                            <div>
                                                <span className="text-muted-foreground">Backend Framework:</span>{' '}
                                                <span className="font-medium">{discoveryInfo.backendFramework}</span>
                                            </div>
                                        )}
                                        {(discoveryInfo.backendEntryPoint || discoveryInfo.entryPoint) && (
                                            <div>
                                                <span className="text-muted-foreground">Backend Entry:</span>{' '}
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {discoveryInfo.backendEntryPoint || discoveryInfo.entryPoint}
                                                </code>
                                            </div>
                                        )}
                                        {(serverInfo.backendPort || serverInfo.port) && (
                                            <div>
                                                <span className="text-muted-foreground">Backend Port:</span>{' '}
                                                <span className="font-medium">{serverInfo.backendPort || serverInfo.port}</span>
                                            </div>
                                        )}
                                        {discoveryInfo.moduleType && (
                                            <div>
                                                <span className="text-muted-foreground">Module Type:</span>{' '}
                                                <span className="font-medium">{discoveryInfo.moduleType}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Column: Database & Frontend */}
                                    <div className="space-y-3">
                                        {discoveryInfo.databaseUsed !== undefined && (
                                            <div>
                                                <span className="text-muted-foreground">Database:</span>{' '}
                                                <span className="font-medium">
                                                    {discoveryInfo.databaseUsed ? 'Yes' : 'No'}
                                                </span>
                                            </div>
                                        )}
                                        {discoveryInfo.frontendFramework && (
                                            <div>
                                                <span className="text-muted-foreground">Frontend Framework:</span>{' '}
                                                <span className="font-medium">{discoveryInfo.frontendFramework}</span>
                                            </div>
                                        )}
                                        {discoveryInfo.frontendEntryPoint && (
                                            <div>
                                                <span className="text-muted-foreground">Frontend Entry:</span>{' '}
                                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                    {discoveryInfo.frontendEntryPoint}
                                                </code>
                                            </div>
                                        )}
                                        {serverInfo.frontendPort && (
                                            <div>
                                                <span className="text-muted-foreground">Frontend Port:</span>{' '}
                                                <span className="font-medium">{serverInfo.frontendPort}</span>
                                            </div>
                                        )}
                                    </div>
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
                                <TestsPanel tests={job.tests as Test[]} />
                            </TabsContent>

                            <TabsContent value="failed" className="space-y-4 mt-4">
                                <TestsPanel tests={job.tests.filter((t) => t.status === "FAIL") as Test[]} />
                            </TabsContent>

                            <TabsContent value="passed" className="space-y-4 mt-4">
                                <TestsPanel tests={job.tests.filter((t) => t.status === "PASS") as Test[]} />
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

function TestsPanel({ tests }: { tests: Test[] }) {
    const backendTests = tests.filter((test) => !isFullStackTest(test));
    const fullStackTests = tests.filter(isFullStackTest);
    const backendPass = backendTests.filter((t) => t.status === "PASS").length;
    const backendFail = backendTests.filter((t) => t.status !== "PASS").length;
    const browserPass = fullStackTests.filter((t) => t.status === "PASS").length;
    const browserFail = fullStackTests.filter((t) => t.status !== "PASS").length;

    const toneFor = (pass: number, fail: number) => {
        if (pass + fail === 0) return "text-muted-foreground";
        if (fail === 0) return "text-chart-2";
        if (pass === 0) return "text-destructive";
        return "text-amber-500";
    };

    const fullStackByFeature = fullStackTests.reduce((acc, test) => {
        const feature = test.featureName?.trim() || "Ungrouped Full-Stack Tests";
        if (!acc.has(feature)) {
            acc.set(feature, []);
        }
        acc.get(feature)?.push(test);
        return acc;
    }, new Map<string, Test[]>());

    return (
        <div className="space-y-6">
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-3">
                <span>Coverage Summary:</span>
                <span className={toneFor(browserPass, browserFail)}>
                    Browser edge cases: {fullStackTests.length} ({browserPass} pass, {browserFail} fail)
                </span>
                <span className={toneFor(backendPass, backendFail)}>
                    API test files: {backendTests.length} ({backendPass} pass, {backendFail} fail)
                </span>
            </div>

            {Array.from(fullStackByFeature.entries()).map(([featureName, featureTests]) => (
                <Card key={featureName} className="p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Badge variant="outline">Browser</Badge>
                        <h3 className="text-base font-semibold">{featureName}</h3>
                        <Badge variant="secondary">{featureTests.length} edge case{featureTests.length === 1 ? "" : "s"}</Badge>
                    </div>
                    <div className="space-y-3">
                        {featureTests.map((test) => (
                            <FullStackEdgeCaseRow key={test.id} test={test} />
                        ))}
                    </div>
                </Card>
            ))}

            {backendTests.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline">API Test Files</Badge>
                        <span className="text-sm text-muted-foreground">{backendTests.length} recorded</span>
                    </div>
                    {backendTests.map((test) => (
                        <TestCard key={test.id} test={test} />
                    ))}
                </div>
            )}
        </div>
    );
}

function FullStackEdgeCaseRow({ test }: { test: Test }) {
    const statusConfig = {
        PASS: {
            color: "bg-chart-2/20 text-chart-2 border-chart-2",
            icon: CheckCircle2,
            symbol: "✓",
        },
        FAIL: {
            color: "bg-destructive/20 text-destructive border-destructive",
            icon: XCircle,
            symbol: "✗",
        },
        ERROR: {
            color: "bg-chart-1/20 text-chart-1 border-chart-1",
            icon: AlertCircle,
            symbol: "!",
        },
    } as const;

    const config = statusConfig[test.status];
    const StatusIcon = config.icon;
    const steps = parseSteps(test.steps);
    const networkAssertions = parseNetworkAssertions(test.networkAssertions);
    const uiAssertions = parseUiAssertions(test.uiAssertions);

    return (
        <div className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge className={`${config.color} flex items-center gap-1.5`}>
                    <StatusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                    {test.status}
                </Badge>
                <span className="text-sm font-medium">{test.testName}</span>
                <span className="text-xs text-muted-foreground font-mono">{test.testFile}</span>
            </div>

            {steps.length > 0 && (
                <p className="text-xs text-muted-foreground mb-2">
                    Steps: {steps.join(" → ")}
                </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3">
                <div>
                    {test.screenshotUrl ? (
                        <Dialog>
                            <DialogTrigger asChild>
                                <button className="w-full rounded-md border bg-muted/20 p-1 hover:bg-muted/40 transition-colors">
                                    <img
                                        src={test.screenshotUrl}
                                        alt={`${test.testName} screenshot`}
                                        className="w-full h-28 object-cover rounded"
                                    />
                                </button>
                            </DialogTrigger>
                            <DialogContent className="!w-[75vw] !max-w-none h-[75vh] max-h-[75vh] p-1 overflow-hidden">
                                <DialogTitle className="sr-only">
                                    {`${test.testName} screenshot preview`}
                                </DialogTitle>
                                <img
                                    src={test.screenshotUrl}
                                    alt={`${test.testName} full screenshot`}
                                    className="w-full h-full object-contain rounded-md"
                                />
                            </DialogContent>
                        </Dialog>
                    ) : (
                        <div className="w-full h-30 rounded-md border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                            No screenshot
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    {networkAssertions.length > 0 && networkAssertions.map((assertion, index) => (
                        <p key={`${test.id}-network-${index}`} className="text-xs">
                            <span className="font-medium">Network:</span>{" "}
                            {assertion.method.toUpperCase()} {assertion.url} expected {assertion.expectedStatus} got {assertion.actualStatus} {assertion.passed ? "✓" : "✗"}
                        </p>
                    ))}

                    {uiAssertions.length > 0 && uiAssertions.map((assertion, index) => (
                        <p key={`${test.id}-ui-${index}`} className="text-xs">
                            <span className="font-medium">UI:</span>{" "}
                            {assertion.selector} expected {`"${assertion.expected}"`} got {`"${assertion.actual}"`} {assertion.passed ? "✓" : "✗"}
                        </p>
                    ))}

                    {test.output && (
                        <p className="text-xs text-muted-foreground">
                            Output: {test.output}
                        </p>
                    )}

                    {(networkAssertions.length === 0 && uiAssertions.length === 0 && !test.output) && (
                        <p className="text-xs text-muted-foreground">
                            {config.symbol === "✓" ? "Edge case passed with no additional assertions." : "Edge case failed. Add assertions for richer diagnostics."}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function CancelledState({ backHref }: { backHref: string }) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6">
            <Card className="p-8 text-center max-w-lg w-full">
                <h2 className="text-2xl font-bold mb-2">Job Cancelled</h2>
                <p className="text-muted-foreground mb-6">
                    This run was canceled before completion.
                </p>
                <div className="flex items-center justify-center gap-2">
                    <Button asChild variant="outline">
                        <a href={backHref}>
                            <ArrowLeft className="mr-1.5 h-4 w-4" />
                            Back
                        </a>
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function LoadingState({
    onBack,
    onCancel,
    isCancelling,
}: {
    onBack: () => void;
    onCancel: () => void;
    isCancelling: boolean;
}) {
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
        <div className="min-h-screen bg-background">
            <div className="fixed top-6 left-6 z-20">
                <Button variant="outline" onClick={onBack}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Back
                </Button>
            </div>

            <div className="flex min-h-screen items-center justify-center px-8">
                <div className="w-full max-w-2xl text-center">
                    <div className="relative min-h-24 flex items-center justify-center">
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

                    <div className="mt-8 flex items-center justify-center">
                    <Button variant="destructive" onClick={onCancel} disabled={isCancelling}>
                        {isCancelling ? "Cancelling..." : "Cancel Job"}
                    </Button>
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

            {bug.affectedLayer && (
                <p className="text-sm text-card-foreground mb-2">
                    <strong>Affected Layer:</strong> {formatAffectedLayer(bug.affectedLayer)}
                </p>
            )}

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
