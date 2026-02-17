"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";

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
        <div className="min-h-screen bg-background">
            {/* Header */}
            <Header />

            {/* Hero Content */}
            <div className="max-w-4xl mx-auto px-6 pt-16 pb-16">
                <div className="text-center space-y-8 mb-16">
                    {/* Logo */}
                    <div className="flex justify-center">
                        <Image
                            src="/logo.svg"
                            alt="CodeSentinel Logo"
                            width={96}
                            height={96}
                            className="w-24 h-24"
                        />
                    </div>

                    {/* Heading */}
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
                        Autonomous bug testing with CodeSentinel
                    </h1>

                    {/* Description */}
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Describe a bug, and CodeSentinel autonomously analyzes your codebase,
                        sets up the environment, writes tests, and confirms if the bug exists.
                    </p>
                </div>

                {/* Main Input Card */}
                <div className="max-w-3xl mx-auto">
                    <Card className="p-8 bg-card border-2 rounded-2xl">
                        <div className="space-y-6">
                            {/* Repository Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">
                                    Repository
                                </label>
                                <Select
                                    value={selectedRepo}
                                    onValueChange={setSelectedRepo}
                                    disabled={isLoadingRepos || !isSignedIn}
                                >
                                    <SelectTrigger className="w-full h-14 text-base border-2">
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
                                                        <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                                            Private
                                                        </span>
                                                    )}
                                                    {repo.language && (
                                                        <span className="text-xs text-muted-foreground">
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
                                <label className="text-sm font-semibold text-foreground">
                                    Bug Description
                                </label>
                                <Textarea
                                    placeholder="Example: Signup accepts weak passwords like '123' without validation. Expected: Should reject passwords shorter than 8 characters with 400 status."
                                    value={bugDescription}
                                    onChange={(e) => setBugDescription(e.target.value)}
                                    rows={6}
                                    className="resize-none text-base border-2"
                                />
                            </div>

                            {/* Submit Button */}
                            <div className="flex justify-center">
                                <Button
                                    onClick={handleRun}
                                    disabled={
                                        invokeTestAgent.isPending ||
                                        !selectedRepo ||
                                        !bugDescription ||
                                        !isSignedIn
                                    }
                                    className="w-12 h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground p-0 flex items-center justify-center transition-all disabled:opacity-100"
                                >
                                    {invokeTestAgent.isPending ? (
                                        <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                                    ) : (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="w-5 h-5"
                                        >
                                            <path d="M12 19V5M5 12l7-7 7 7" />
                                        </svg>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Page;
