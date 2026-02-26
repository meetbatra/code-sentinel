"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, Square } from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type JobCard = {
  id: string;
  status: string;
  summary: string | null;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  repository: { repoOwner: string; repoName: string };
  _count: { tests: number; bugs: number };
  tests: Array<{ status: "PASS" | "FAIL" | "ERROR" }>;
};

export default function AllJobsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [optimisticallyCancelledJobIds, setOptimisticallyCancelledJobIds] = useState<Set<string>>(new Set());
  const [optimisticallyRerunningJobIds, setOptimisticallyRerunningJobIds] = useState<Set<string>>(new Set());
  const [optimisticNewJobs, setOptimisticNewJobs] = useState<Array<JobCard>>([]);

  const { data, isLoading } = useQuery(
    trpc.jobs.list.queryOptions(
      { limit: 100 },
      {
        refetchInterval: 2000,
      }
    )
  );

  const cancelRun = useMutation(
    trpc.jobs.cancel.mutationOptions({
      onSuccess: (result) => {
        if (!result.success) {
          toast.error(result.message ?? "Unable to cancel run");
          return;
        }
        toast.success("Run canceled");
        void queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const rerunJob = useMutation(trpc.jobs.rerun.mutationOptions());

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading jobs...</p>;
  }

  const serverJobs = data?.jobs ?? [];
  const jobs = [...optimisticNewJobs, ...serverJobs];
  const getCategory = (job: JobCard) => {
    const isRunning = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(job.status);
    const isOptimisticallyCancelled = optimisticallyCancelledJobIds.has(job.id);
    const isCancelled =
      isOptimisticallyCancelled ||
      job.status === "FAILED" && (job.summary ?? "").toLowerCase().includes("canceled by user");
    if (isRunning) return "running" as const;
    if (isCancelled) return "cancelled" as const;
    return "completed" as const;
  };

  const sortByTimeDesc = (a: JobCard, b: JobCard) => {
    const aTime = new Date(a.completedAt ?? a.startedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.completedAt ?? b.startedAt ?? b.createdAt).getTime();
    return bTime - aTime;
  };

  const sortedAllJobs = [...jobs].sort((a, b) => {
    const order = { running: 0, completed: 1, cancelled: 2 } as const;
    const aCategory = getCategory(a);
    const bCategory = getCategory(b);
    if (aCategory !== bCategory) return order[aCategory] - order[bCategory];
    return sortByTimeDesc(a, b);
  });

  const runningJobs = sortedAllJobs.filter((job) => getCategory(job) === "running");
  const completedJobs = sortedAllJobs.filter((job) => getCategory(job) === "completed");
  const cancelledJobs = sortedAllJobs.filter((job) => getCategory(job) === "cancelled");

  const handleRerun = (job: JobCard) => {
    if (optimisticallyRerunningJobIds.has(job.id)) return;

    const tempId = `optimistic-${Date.now()}-${job.id}`;
    const tempJob: JobCard = {
      id: tempId,
      status: "PENDING",
      summary: null,
      createdAt: new Date(),
      repository: job.repository,
      _count: { tests: 0, bugs: 0 },
      tests: [],
    };

    setOptimisticallyRerunningJobIds((prev) => new Set(prev).add(job.id));
    setOptimisticNewJobs((prev) => [tempJob, ...prev]);

    rerunJob.mutate(
      { jobId: job.id },
      {
        onSuccess: () => {
          toast.success("Run queued again");
          setOptimisticallyRerunningJobIds((prev) => {
            const next = new Set(prev);
            next.delete(job.id);
            return next;
          });
          void queryClient.invalidateQueries();
          setTimeout(() => {
            setOptimisticNewJobs((prev) => prev.filter((j) => j.id !== tempId));
          }, 1500);
        },
        onError: (error) => {
          toast.error(error.message);
          setOptimisticallyRerunningJobIds((prev) => {
            const next = new Set(prev);
            next.delete(job.id);
            return next;
          });
          setOptimisticNewJobs((prev) => prev.filter((j) => j.id !== tempId));
        },
      }
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">All Jobs</h1>
        <Button asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>

      <Tabs defaultValue="all" className="space-y-3">
        <TabsList>
          <TabsTrigger value="all">All ({sortedAllJobs.length})</TabsTrigger>
          <TabsTrigger value="running">Running ({runningJobs.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedJobs.length})</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled ({cancelledJobs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <JobsGrid
            jobs={sortedAllJobs}
            cancelRun={cancelRun}
            onRerun={handleRerun}
            optimisticallyCancelledJobIds={optimisticallyCancelledJobIds}
            setOptimisticallyCancelledJobIds={setOptimisticallyCancelledJobIds}
            optimisticallyRerunningJobIds={optimisticallyRerunningJobIds}
            setOptimisticallyRerunningJobIds={setOptimisticallyRerunningJobIds}
          />
        </TabsContent>

        <TabsContent value="running">
          <JobsGrid
            jobs={runningJobs}
            cancelRun={cancelRun}
            onRerun={handleRerun}
            optimisticallyCancelledJobIds={optimisticallyCancelledJobIds}
            setOptimisticallyCancelledJobIds={setOptimisticallyCancelledJobIds}
            optimisticallyRerunningJobIds={optimisticallyRerunningJobIds}
            setOptimisticallyRerunningJobIds={setOptimisticallyRerunningJobIds}
          />
        </TabsContent>

        <TabsContent value="completed">
          <JobsGrid
            jobs={completedJobs}
            cancelRun={cancelRun}
            onRerun={handleRerun}
            optimisticallyCancelledJobIds={optimisticallyCancelledJobIds}
            setOptimisticallyCancelledJobIds={setOptimisticallyCancelledJobIds}
            optimisticallyRerunningJobIds={optimisticallyRerunningJobIds}
            setOptimisticallyRerunningJobIds={setOptimisticallyRerunningJobIds}
          />
        </TabsContent>

        <TabsContent value="cancelled">
          <JobsGrid
            jobs={cancelledJobs}
            cancelRun={cancelRun}
            onRerun={handleRerun}
            optimisticallyCancelledJobIds={optimisticallyCancelledJobIds}
            setOptimisticallyCancelledJobIds={setOptimisticallyCancelledJobIds}
            optimisticallyRerunningJobIds={optimisticallyRerunningJobIds}
            setOptimisticallyRerunningJobIds={setOptimisticallyRerunningJobIds}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobsGrid({
  jobs,
  cancelRun,
  onRerun,
  optimisticallyCancelledJobIds,
  setOptimisticallyCancelledJobIds,
  optimisticallyRerunningJobIds,
  setOptimisticallyRerunningJobIds,
}: {
  jobs: Array<{
    id: string;
    status: string;
    summary: string | null;
    createdAt: Date;
    repository: { repoOwner: string; repoName: string };
    _count: { tests: number; bugs: number };
    tests: Array<{ status: "PASS" | "FAIL" | "ERROR" }>;
  }>;
  cancelRun: {
    mutate: (
      input: { jobId: string },
      options?: {
        onSuccess?: (result: { success: boolean; message?: string }) => void;
        onError?: () => void;
      }
    ) => void;
  };
  onRerun: (job: JobCard) => void;
  optimisticallyCancelledJobIds: Set<string>;
  setOptimisticallyCancelledJobIds: (updater: (prev: Set<string>) => Set<string>) => void;
  optimisticallyRerunningJobIds: Set<string>;
  setOptimisticallyRerunningJobIds: (updater: (prev: Set<string>) => Set<string>) => void;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {jobs.map((job) => {
          const isOptimisticallyCancelled = optimisticallyCancelledJobIds.has(job.id);
          const isOptimisticallyRerunning = optimisticallyRerunningJobIds.has(job.id);
          const isRunning = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(job.status) && !isOptimisticallyCancelled;
          const isCancelled =
            isOptimisticallyCancelled ||
            job.status === "FAILED" &&
            (job.summary ?? "").toLowerCase().includes("canceled by user");
          const statusLabel = isRunning ? "Running" : isCancelled ? "Cancelled" : "Completed";
          const statusClassName = isRunning
            ? "border-yellow-200 bg-yellow-50 text-yellow-800"
            : isCancelled
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700";
          const passedCount = job.tests.filter((test) => test.status === "PASS").length;
          const totalTests = job._count.tests;

          return (
            <div
              key={job.id}
              className="relative flex min-h-36 items-center justify-between gap-4 rounded-xl border border-border/70 px-5 py-5"
            >
              <Badge variant="outline" className={`absolute top-3 right-3 ${statusClassName}`}>
                {statusLabel}
              </Badge>

              <div className="space-y-2">
                <p className="font-medium">
                  {job.repository.repoOwner}/{job.repository.repoName}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md bg-muted px-2 py-1">Tests: {totalTests}</span>
                  <span className="rounded-md bg-muted px-2 py-1">Bugs: {job._count.bugs}</span>
                  <span className="rounded-md bg-muted px-2 py-1">
                    Passed: {passedCount}/{totalTests}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(job.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-6">
                {isRunning ? (
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Cancel run"
                    title="Cancel run"
                    onClick={() => {
                      if (optimisticallyCancelledJobIds.has(job.id)) return;
                      setOptimisticallyCancelledJobIds((prev) => new Set(prev).add(job.id));
                      cancelRun.mutate(
                        { jobId: job.id },
                        {
                          onSuccess: (result: { success: boolean; message?: string }) => {
                            if (!result.success) {
                              setOptimisticallyCancelledJobIds((prev) => {
                                const next = new Set(prev);
                                next.delete(job.id);
                                return next;
                              });
                            }
                          },
                          onError: () => {
                            setOptimisticallyCancelledJobIds((prev) => {
                              const next = new Set(prev);
                              next.delete(job.id);
                              return next;
                            });
                          },
                        } as {
                          onError?: () => void;
                        }
                      );
                    }}
                  >
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="Re-run"
                    title="Re-run"
                    disabled={isOptimisticallyRerunning}
                    onClick={() => {
                      if (optimisticallyRerunningJobIds.has(job.id)) return;
                      setOptimisticallyRerunningJobIds((prev) => new Set(prev).add(job.id));
                      onRerun(job);
                    }}
                  >
                    {isOptimisticallyRerunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                <Button asChild size="icon" variant="outline" aria-label="Open test page" title="Open test page">
                  <Link href={`/test/${job.id}?from=dashboard`}>!</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
    </Card>
  );
}
