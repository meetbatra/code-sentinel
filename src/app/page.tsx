"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Header } from "@/components/header";

const Page = () => {
    const trpc = useTRPC();
    const router = useRouter();
    const { isSignedIn } = useUser();

    const [selectedRepo, setSelectedRepo] = useState<string>("");
    const [bugDescription, setBugDescription] = useState("");

    // Fetch user's GitHub repositories
    const { data: repos, isLoading: isLoadingRepos } = useQuery(
        trpc.github.getRepositories.queryOptions(undefined, {
            enabled: isSignedIn,
        })
    );

    const invokeTestAgent = useMutation(
        trpc.testAgent.run.mutationOptions({
            onSuccess: (data) => {
                toast.success("Test agent started!");
                router.push(`/test/${data.jobId}`);
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
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            {/* Header */}
            <Header />

            {/* Hero Content */}
            <div className="max-w-4xl mx-auto px-6 pt-20 pb-16">
                <div className="text-center space-y-6 mb-16">
                    <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
                        Autonomous bug testing<br />
                        <span className="text-orange-500">powered by AI</span>
                    </h1>

                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Describe a bug, and CodeSentinel autonomously analyzes your codebase,
                        sets up the environment, writes tests, and confirms if the bug exists.
                    </p>
                </div>

                {/* Main Input Card */}
                <div className="max-w-2xl mx-auto">
                    <Card className="p-8 bg-white border-gray-200 shadow-xl">
                        <div className="space-y-6">
                            {/* Repository Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-900">
                                    Repository
                                </label>
                                <Select
                                    value={selectedRepo}
                                    onValueChange={setSelectedRepo}
                                    disabled={isLoadingRepos || !isSignedIn}
                                >
                                    <SelectTrigger className="h-12 text-base border-gray-300 focus:border-orange-500 focus:ring-orange-500">
                                        <SelectValue placeholder={
                                            !isSignedIn
                                                ? "Sign in with GitHub to continue"
                                                : isLoadingRepos
                                                ? "Loading repositories..."
                                                : "Choose a repository"
                                        } />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {repos?.map((repo) => (
                                            <SelectItem key={repo.id} value={repo.fullName}>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{repo.fullName}</span>
                                                    {repo.private && (
                                                        <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                                                            Private
                                                        </span>
                                                    )}
                                                    {repo.language && (
                                                        <span className="text-xs text-gray-500">
                                                            {repo.language}
                                                        </span>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Bug Description */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-gray-900">
                                    Bug Description
                                </label>
                                <Textarea
                                    placeholder="Example: Signup accepts weak passwords like '123' without validation. Expected: Should reject passwords shorter than 8 characters with 400 status."
                                    value={bugDescription}
                                    onChange={(e) => setBugDescription(e.target.value)}
                                    rows={5}
                                    className="resize-none border-gray-300 focus:border-orange-500 focus:ring-orange-500 text-base"
                                />
                            </div>

                            {/* Submit Button */}
                            <Button
                                onClick={handleRun}
                                disabled={
                                    invokeTestAgent.isPending ||
                                    !selectedRepo ||
                                    !bugDescription ||
                                    !isSignedIn
                                }
                                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white text-base font-semibold shadow-lg hover:shadow-xl transition-all"
                            >
                                {invokeTestAgent.isPending ? (
                                    <span className="flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Starting...
                                    </span>
                                ) : (
                                    "Start Testing"
                                )}
                            </Button>
                        </div>
                    </Card>

                    {/* Feature highlights */}
                    <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                        <div className="space-y-2">
                            <div className="text-2xl">⚡</div>
                            <h3 className="font-semibold text-gray-900">Real-time Testing</h3>
                            <p className="text-sm text-gray-600">Watch progress as tests run live</p>
                        </div>
                        <div className="space-y-2">
                            <div className="text-2xl">🔍</div>
                            <h3 className="font-semibold text-gray-900">Root Cause Analysis</h3>
                            <p className="text-sm text-gray-600">Pinpoints exact source of issues</p>
                        </div>
                        <div className="space-y-2">
                            <div className="text-2xl">📝</div>
                            <h3 className="font-semibold text-gray-900">Detailed Reports</h3>
                            <p className="text-sm text-gray-600">Get comprehensive test results</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Page;
