"use client";

import { useTRPC } from "@/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { toast } from "sonner";

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

interface Bug {
    id: string;
    message: string;
    rootCause: string | null;
    sourceFile: string | null;
    confidence: BugConfidence;
    testFile: string | null;
    testName: string | null;
}

interface Job {
    id: string;
    status: JobStatus;
    bugDescription: string;
    summary: string | null;
    repository: Repository;
    tests: Test[];
    bugs: Bug[];
}

export default function TestResultsPage() {
    const params = useParams();
    const jobId = params.jobId as string;
    const trpc = useTRPC();

    // Poll every 2s if job is still running
    const { data: job, isLoading } = useQuery(
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

    if (isLoading) {
        return <LoadingState />;
    }

    if (!job) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Card className="p-8 text-center">
                    <h2 className="text-2xl font-bold mb-2">Job not found</h2>
                    <p className="text-gray-600">This test job does not exist or has been deleted.</p>
                </Card>
            </div>
        );
    }

    const isActive = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(job.status);

    if (isActive) {
        return <LoadingState job={job} />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="container mx-auto px-6 py-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {job.repository.repoOwner}/{job.repository.repoName}
                            </h1>
                            <a
                                href={job.repository.repoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:underline"
                            >
                                {job.repository.repoUrl}
                            </a>
                        </div>
                        <StatusBadge status={job.status} />
                    </div>
                    <p className="text-gray-700">{job.bugDescription}</p>
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-6 py-8 space-y-6">
                {/* Bugs Section */}
                {job.bugs.length > 0 && (
                    <Card className="p-6">
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            Bugs Found
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

                {/* Summary Section */}
                {job.summary && (
                    <Card className="p-6">
                        <h2 className="text-xl font-bold mb-4">Summary</h2>
                        <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 p-4 rounded">
                            {job.summary}
                        </pre>
                    </Card>
                )}

                {/* Empty State */}
                {job.tests.length === 0 && job.status === "COMPLETED" && (
                    <Card className="p-8 text-center">
                        <p className="text-gray-600">No tests were generated for this job.</p>
                    </Card>
                )}
            </div>
        </div>
    );
}

function LoadingState({ job }: { job?: Job }) {
    const getStatusMessage = (status?: string) => {
        switch (status) {
            case "PENDING":
                return "Initializing test environment...";
            case "ANALYZING":
                return "Analyzing your codebase...";
            case "SETTING_UP":
                return "Setting up dependencies and environment...";
            case "TESTING":
                return "Generating and running tests...";
            default:
                return "Starting test agent...";
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <Card className="p-12 max-w-2xl w-full">
                <div className="text-center space-y-6">
                    {/* Animated Icon */}
                    <div className="flex justify-center">
                        <div className="relative">
                            <div className="w-24 h-24 border-8 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-12 h-12 bg-orange-100 rounded-full" />
                            </div>
                        </div>
                    </div>

                    {/* Status Message */}
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            {getStatusMessage(job?.status)}
                        </h2>
                        {job && (
                            <div className="flex items-center justify-center gap-2">
                                <StatusBadge status={job.status} />
                            </div>
                        )}
                    </div>

                    {/* Progress Steps */}
                    <div className="space-y-3 text-left">
                        <ProgressStep
                            label="Environment Created"
                            completed={job && job.status !== "PENDING"}
                        />
                        <ProgressStep
                            label="Analyzing Codebase"
                            completed={
                                job &&
                                ["SETTING_UP", "TESTING", "COMPLETED"].includes(job.status)
                            }
                            active={job?.status === "ANALYZING"}
                        />
                        <ProgressStep
                            label="Setting Up Dependencies"
                            completed={job && ["TESTING", "COMPLETED"].includes(job.status)}
                            active={job?.status === "SETTING_UP"}
                        />
                        <ProgressStep
                            label="Running Tests"
                            completed={job?.status === "COMPLETED"}
                            active={job?.status === "TESTING"}
                        />
                    </div>

                    <p className="text-sm text-gray-500">
                        This usually takes 2-5 minutes. You can safely leave this page - we&#39;ll save
                        your results.
                    </p>
                </div>
            </Card>
        </div>
    );
}

function ProgressStep({
    label,
    completed,
    active,
}: {
    label: string;
    completed?: boolean;
    active?: boolean;
}) {
    return (
        <div className="flex items-center gap-3">
            <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    completed
                        ? "bg-green-500"
                        : active
                        ? "bg-orange-500 animate-pulse"
                        : "bg-gray-300"
                }`}
            >
                {completed ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                        />
                    </svg>
                ) : active ? (
                    <div className="w-2 h-2 bg-white rounded-full" />
                ) : null}
            </div>
            <span
                className={`text-sm ${
                    completed ? "text-gray-900 font-medium" : "text-gray-600"
                }`}
            >
                {label}
            </span>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { bg: string; text: string }> = {
        PENDING: { bg: "bg-gray-100", text: "text-gray-700" },
        ANALYZING: { bg: "bg-blue-100", text: "text-blue-700" },
        SETTING_UP: { bg: "bg-yellow-100", text: "text-yellow-700" },
        TESTING: { bg: "bg-purple-100", text: "text-purple-700" },
        COMPLETED: { bg: "bg-green-100", text: "text-green-700" },
        FAILED: { bg: "bg-red-100", text: "text-red-700" },
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
        HIGH: "border-red-500 bg-red-50",
        MEDIUM: "border-yellow-500 bg-yellow-50",
        LOW: "border-gray-500 bg-gray-50",
    };

    return (
        <Card className={`p-4 border-l-4 ${confidenceColors[bug.confidence as keyof typeof confidenceColors]}`}>
            <div className="flex items-start justify-between mb-2">
                <Badge variant="destructive">{bug.confidence} CONFIDENCE</Badge>
                {bug.sourceFile && (
                    <span className="text-xs text-gray-600 font-mono">{bug.sourceFile}</span>
                )}
            </div>

            <h3 className="font-semibold text-lg mb-2">{bug.message}</h3>

            {bug.rootCause && (
                <p className="text-sm text-gray-700 mb-3">
                    <strong>Root Cause:</strong> {bug.rootCause}
                </p>
            )}

            {bug.testFile && (
                <p className="text-xs text-gray-500">
                    Found by: <span className="font-mono">{bug.testFile}</span>
                    {bug.testName && <> → {bug.testName}</>}
                </p>
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

    const handleCopy = async () => {
        await navigator.clipboard.writeText(test.fileContent);
        toast.success("Test code copied to clipboard");
    };

    const statusColors = {
        PASS: "bg-green-50 text-green-700 border-green-300",
        FAIL: "bg-red-50 text-red-700 border-red-300",
        ERROR: "bg-orange-50 text-orange-700 border-orange-300",
    };

    return (
        <Card className="p-4">
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge
                            className={statusColors[test.status as keyof typeof statusColors]}
                        >
                            {test.status}
                        </Badge>
                        <span className="font-mono text-sm text-gray-700">{test.testFile}</span>
                    </div>
                    <p className="text-gray-600 text-sm">{test.testName}</p>
                    {test.exitCode !== null && (
                        <p className="text-xs text-gray-500 mt-1">Exit code: {test.exitCode}</p>
                    )}
                </div>

                <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
                    {isExpanded ? "Hide" : "Show"} Details
                </Button>
            </div>

            {isExpanded && (
                <div className="mt-4 space-y-4 border-t pt-4">
                    {/* Output */}
                    {test.output && (
                        <div>
                            <h4 className="text-sm font-semibold mb-2">Output:</h4>
                            <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
                                {test.output}
                            </pre>
                        </div>
                    )}

                    {/* Test Code */}
                    <div>
                        <h4 className="text-sm font-semibold mb-2">Test Code:</h4>
                        <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
                            {test.fileContent}
                        </pre>
                        <div className="flex gap-2 mt-3">
                            <Button size="sm" onClick={handleCopy}>
                                Copy Code
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleDownload}>
                                Download File
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
}





