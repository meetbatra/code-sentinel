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
        <div className="min-h-screen bg-linear-to-b from-sky-100 via-blue-50 to-orange-50">
            {/* Header */}
            <Header />

            {/* Hero Content */}
            <div className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center space-y-8">
                <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
                    AI that writes tests to reproduce your bugs
                </h1>

                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                    Select a repository from GitHub. CodeSentinel analyzes your codebase and
                    automatically generates test files that prove the issue exists.
                </p>

                {/* Main Input Card */}
                <div className="max-w-2xl mx-auto mt-12">
                    <Card className="p-6 bg-white/80 backdrop-blur-sm border-gray-200 shadow-lg">
                        <div className="space-y-4">
                            {/* Repository Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Select Repository
                                </label>
                                <Select
                                    value={selectedRepo}
                                    onValueChange={setSelectedRepo}
                                    disabled={isLoadingRepos || !isSignedIn}
                                >
                                    <SelectTrigger className="h-14 text-base border-gray-300 focus:border-orange-400 focus:ring-orange-400">
                                        <SelectValue placeholder={
                                            !isSignedIn
                                                ? "Please sign in with GitHub"
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
                                <label className="text-sm font-medium text-gray-700">
                                    Describe the Bug
                                </label>
                                <Textarea
                                    placeholder="Example: Login fails when user enters special characters in email field. Expected: Should accept valid email formats. Actual: Throws validation error for emails with '+' symbol."
                                    value={bugDescription}
                                    onChange={(e) => setBugDescription(e.target.value)}
                                    rows={6}
                                    className="resize-none border-gray-300 focus:border-orange-400 focus:ring-orange-400"
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
                                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white text-base font-medium"
                            >
                                {invokeTestAgent.isPending ? (
                                    <span className="flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Starting Test Agent...
                                    </span>
                                ) : (
                                    "Generate Tests"
                                )}
                            </Button>
                        </div>
                    </Card>

                    <p className="text-sm text-gray-500 mt-6">
                        The AI will generate test files you can run in your own environment
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Page;
