"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

const Page = () => {
    const trpc = useTRPC();

    const [repoUrl, setRepoUrl] = useState("");
    const [errorDescription, setErrorDescription] = useState("");

    const invokeTestAgent = useMutation(
        trpc.testAgent.run.mutationOptions({
            onSuccess: () => {
                toast.success("Test agent started. Tests are being generated.");
            },
            onError: (err) => {
                toast.error(err.message ?? "Failed to start test agent");
            },
        })
    );

    const handleRun = () => {
        if (!repoUrl || !errorDescription) {
            toast.error("Please provide both repo URL and error description");
            return;
        }

        invokeTestAgent.mutate({
            repoUrl,
            value: errorDescription,
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-sky-100 via-blue-50 to-orange-50">
            {/* Navigation */}
            <nav className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg" />
                    <span className="text-xl font-bold text-gray-900">CodeSentinel</span>
                </div>
                <div className="flex items-center gap-6">
                    <Button variant="ghost" className="text-gray-700 hover:text-gray-900">
                        Pricing
                    </Button>
                    <Button variant="ghost" className="text-gray-700 hover:text-gray-900">
                        Enterprise
                    </Button>
                    <Button className="bg-lime-300 text-gray-900 hover:bg-lime-400 rounded-full px-6">
                        Start Building
                    </Button>
                </div>
            </nav>

            {/* Hero Content */}
            <div className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center space-y-8">
                <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
                    AI that writes tests to reproduce your bugs
                </h1>

                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                    Describe a bug in your GitHub repo. CodeSentinel analyzes your codebase and automatically generates test files that prove the issue exists.
                </p>

                {/* Main Input Card */}
                <div className="max-w-2xl mx-auto mt-12">
                    <Card className="p-6 bg-white/80 backdrop-blur-sm border-gray-200 shadow-lg">
                        <div className="space-y-4">
                            <div className="relative">
                                <Input
                                    placeholder="https://github.com/username/repository"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    className="h-14 pr-14 text-base border-gray-300 focus:border-orange-400 focus:ring-orange-400"
                                />
                                <Button
                                    onClick={handleRun}
                                    disabled={invokeTestAgent.isPending || !repoUrl || !errorDescription}
                                    size="icon"
                                    className="absolute right-2 top-2 h-10 w-10 bg-orange-500 hover:bg-orange-600 text-white rounded-full"
                                >
                                    {invokeTestAgent.isPending ? (
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                        </svg>
                                    )}
                                </Button>
                            </div>

                            <Textarea
                                placeholder="Describe the bug: e.g., 'Login fails when user enters special characters in email field'"
                                value={errorDescription}
                                onChange={(e) => setErrorDescription(e.target.value)}
                                rows={4}
                                className="resize-none border-gray-300 focus:border-orange-400 focus:ring-orange-400"
                            />
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
