"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import { ArrowUp, Loader2 } from "lucide-react";

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
        });
    };

    return (
        <div>
            {/* Hero Content */}
            <div className="max-w-4xl mx-auto px-6 py-8">
                <div className="text-center space-y-8 mb-4">
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
                    <Card className="p-8 bg-transparent border-0 shadow-none rounded-2xl">
                        <div className="space-y-4">
                            {/* Repository Selector (small pill) */}
                            <div>
                                <div className="flex justify-center">
                                    <Select
                                        value={selectedRepo}
                                        onValueChange={setSelectedRepo}
                                        disabled={isLoadingRepos || !isSignedIn}
                                    >
                                        <SelectTrigger className="inline-flex items-center gap-2 h-8 rounded-full px-3 text-[11px] font-medium border border-border/80 bg-background/60 shadow-sm w-auto max-w-full">
                                            <SelectValue
                                                placeholder={
                                                    !isSignedIn
                                                        ? "Sign in with GitHub"
                                                        : isLoadingRepos
                                                        ? "Loading..."
                                                        : "Choose a repository"
                                                }
                                            />
                                        </SelectTrigger>
                                        <SelectContent
                                            position="popper"
                                            align="center"
                                            sideOffset={10}
                                            className="data-[state=open]:duration-300 data-[state=closed]:duration-200 data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:ease-in-out"
                                        >
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
                            </div>

                            {/* Bug Description + Submit*/}
                            <div>
                                <div className="rounded-4xl bg-card border-2 border-border/80 px-5 py-4 flex items-center gap-4">
                                    <Textarea
                                        placeholder="Example: Signup accepts weak passwords like '123' without validation. Expected: Should reject passwords shorter than 8 characters with 400 status."
                                        value={bugDescription}
                                        onChange={(e) => setBugDescription(e.target.value)}
                                        rows={3}
                                        className="flex-1 min-h-24 resize-none text-base border-0 bg-transparent dark:bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-1"
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" &&
                                                (e.metaKey || e.ctrlKey)
                                            ) {
                                                e.preventDefault();
                                                if (
                                                    !invokeTestAgent.isPending &&
                                                    selectedRepo &&
                                                    bugDescription &&
                                                    isSignedIn
                                                ) {
                                                    handleRun();
                                                }
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleRun}
                                        disabled={
                                            invokeTestAgent.isPending ||
                                            !selectedRepo ||
                                            !bugDescription ||
                                            !isSignedIn
                                        }
                                        className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground p-0 flex items-center justify-center transition-all disabled:opacity-60"
                                    >
                                        {invokeTestAgent.isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <ArrowUp className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default Page;
