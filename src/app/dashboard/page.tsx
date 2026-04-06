"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Navbar } from "@/components/navbar";

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
  const [activeTab, setActiveTab] = useState<"all" | "running" | "completed" | "cancelled">("all");

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

  const serverJobs = data?.jobs ?? [];
  const jobs = [...optimisticNewJobs, ...serverJobs];
  
  const getCategory = (job: JobCard) => {
    const isRunning = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(job.status);
    const isOptimisticallyCancelled = optimisticallyCancelledJobIds.has(job.id);
    const isCancelled =
      isOptimisticallyCancelled ||
      (job.status === "FAILED" && (job.summary ?? "").toLowerCase().includes("canceled by user"));
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

  const categories = {
    all: sortedAllJobs,
    running: sortedAllJobs.filter((job) => getCategory(job) === "running"),
    completed: sortedAllJobs.filter((job) => getCategory(job) === "completed"),
    cancelled: sortedAllJobs.filter((job) => getCategory(job) === "cancelled"),
  };

  const currentJobs = categories[activeTab];

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
    <>
      <Navbar />

      <main className="pt-20 pb-12 px-6 max-w-7xl mx-auto min-h-screen">
        {/* Dashboard Header */}
        <div className="mb-12">
          <h1 className="text-8xl md:text-[9rem] font-arcade text-primary tracking-tighter uppercase leading-none">
            MISSION CONTROL
          </h1>
          <p className="text-secondary font-arcade text-4xl md:text-5xl tracking-[0.2em] opacity-80 uppercase">
            All Test Jobs
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-0 mb-8 border-b-4 border-surface-container-highest">
          {(["all", "running", "completed", "cancelled"] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-8 py-3 font-bold border-t-4 border-l-4 border-r-4 tracking-tighter uppercase text-sm steps-4 transition-all ${
                  isActive
                    ? "bg-primary text-on-primary-container border-primary"
                    : "text-on-surface-variant border-transparent hover:border-surface-container-high hover:text-on-surface"
                }`}
              >
                {tab} ({categories[tab].length})
              </button>
            );
          })}
        </div>

        {/* Job Grid */}
        {isLoading ? (
          <div className="text-center py-24 text-on-surface-variant font-arcade animate-pulse text-2xl">
            LOADING_DATA...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {currentJobs.map((job) => {
              const isOptimisticallyCancelled = optimisticallyCancelledJobIds.has(job.id);
              const isOptimisticallyRerunning = optimisticallyRerunningJobIds.has(job.id);
              const isRunning = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"].includes(job.status) && !isOptimisticallyCancelled;
              const isCancelled =
                isOptimisticallyCancelled ||
                (job.status === "FAILED" && (job.summary ?? "").toLowerCase().includes("canceled by user"));
              
              const statusLabel = isRunning ? "⚡ ACTIVE" : isCancelled ? "✗ CANCELLED" : "✓ DONE";
              const bgColorClass = isRunning ? "bg-secondary" : isCancelled ? "bg-error" : "bg-primary";
              const colorClass = isRunning ? "text-secondary" : isCancelled ? "text-error" : "text-primary";
              const onColorClass = isRunning ? "text-on-secondary" : isCancelled ? "text-on-error" : "text-on-primary-container";
              
              const passedCount = job.tests.filter((t) => t.status === "PASS").length;
              const totalTests = job._count.tests;
              const passRate = totalTests > 0 ? Math.round((passedCount / totalTests) * 100) : 0;

              return (
                <div key={job.id} className="group bg-surface-container-high p-6 border-4 border-transparent hover:border-primary transition-all steps-4 flex flex-col sm:flex-row gap-6 relative shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                  <div className={`absolute -top-4 -left-4 ${bgColorClass} ${onColorClass} px-2 py-1 text-[10px] font-black uppercase`}>
                    ID: {job.id.substring(0, 8)}
                  </div>
                  <div className="flex-grow">
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-2">
                      <h3 className="text-xl font-bold text-primary font-headline tracking-tight truncate max-w-[280px]">
                        {job.repository.repoOwner}/{job.repository.repoName}
                      </h3>
                      <span className={`${bgColorClass}/10 ${colorClass} border border-current px-3 py-1 text-xs font-black tracking-widest font-label whitespace-nowrap`}>
                        {statusLabel}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 mb-6">
                      <div className={`bg-surface-container-lowest px-3 py-1 flex items-center gap-2 border border-outline-variant/30 ${isCancelled ? 'opacity-50' : ''}`}>
                        <span className="text-[10px] text-on-surface-variant font-bold">TESTS</span>
                        <span className="text-on-surface font-black">
                          {isCancelled ? '--' : isRunning ? `${passedCount}/${totalTests}` : totalTests}
                        </span>
                      </div>
                      <div className={`bg-surface-container-lowest px-3 py-1 flex items-center gap-2 border border-outline-variant/30 ${isCancelled ? 'opacity-50' : ''}`}>
                        <span className="text-[10px] text-on-surface-variant font-bold">BUGS</span>
                        <span className={`${isCancelled ? 'text-on-surface' : isRunning ? 'text-secondary' : 'text-error'} font-black`}>
                          {isCancelled ? '--' : job._count.bugs}
                        </span>
                      </div>
                      <div className={`bg-surface-container-lowest px-3 py-1 flex items-center gap-2 border border-outline-variant/30 ${isCancelled ? 'opacity-50' : ''}`}>
                        <span className="text-[10px] text-on-surface-variant font-bold">{isRunning ? 'PROGRESS' : 'PASS'}</span>
                        <span className={`${isCancelled ? 'text-on-surface' : 'text-primary'} font-black`}>
                          {isCancelled ? '--' : `${passRate}%`}
                        </span>
                      </div>
                    </div>
                    
                    {isRunning && (
                      <div className="h-2 w-full bg-surface-container-lowest border border-outline-variant/20 mb-4">
                        <div className="h-full bg-secondary" style={{ width: `${passRate}%` }}></div>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 text-on-surface-variant text-[10px] font-bold uppercase tracking-wider">
                      <span className="material-symbols-outlined text-sm">schedule</span>
                      {new Date(job.createdAt).toLocaleString()} · Branch: main
                    </div>
                  </div>
                  
                  <div className="flex flex-row sm:flex-col gap-2 sm:justify-center border-t sm:border-t-0 sm:border-l border-outline-variant/20 pt-4 sm:pt-0 sm:pl-6">
                    {isRunning ? (
                      <button
                        onClick={() => {
                          if (optimisticallyCancelledJobIds.has(job.id)) return;
                          setOptimisticallyCancelledJobIds((prev) => new Set(prev).add(job.id));
                          cancelRun.mutate({ jobId: job.id });
                        }}
                        className="w-12 h-12 flex items-center justify-center bg-surface-container-highest hover:bg-error hover:text-on-error transition-all steps-4"
                      >
                        <span className="material-symbols-outlined">stop</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRerun(job)}
                        disabled={isOptimisticallyRerunning}
                        className="w-12 h-12 flex items-center justify-center bg-surface-container-highest hover:bg-primary hover:text-on-primary-container transition-all steps-4 disabled:opacity-50"
                      >
                        {isOptimisticallyRerunning ? (
                          <span className="material-symbols-outlined animate-spin">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined">refresh</span>
                        )}
                      </button>
                    )}
                    <Link
                      href={`/test/${job.id}?from=dashboard`}
                      className="w-12 h-12 flex items-center justify-center bg-surface-container-highest hover:bg-secondary hover:text-on-secondary-container transition-all steps-4"
                    >
                      <span className="material-symbols-outlined">chevron_right</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {!isLoading && currentJobs.length === 0 && (
          <div className="text-center py-24 text-on-surface-variant font-arcade text-2xl uppercase">
            NO_MISSIONS_FOUND
          </div>
        )}
      </main>

      {/* Footer Component */}
      <footer className="w-full py-8 border-t-4 border-[#1a1f2f] bg-[#000000]">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 gap-4">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-[#f3ffca] font-headline uppercase tracking-tighter">CODESENTINEL</span>
            <span className="font-body text-xs uppercase tracking-widest text-slate-500">© 2024 CODESENTINEL // MISSION CONTROL</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <Link className="font-body text-xs uppercase tracking-widest text-slate-500 hover:text-[#fc8700] transition-colors duration-150" href="#">Privacy</Link>
            <Link className="font-body text-xs uppercase tracking-widest text-slate-500 hover:text-[#fc8700] transition-colors duration-150" href="#">Terms</Link>
            <Link className="font-body text-xs uppercase tracking-widest text-slate-500 hover:text-[#fc8700] transition-colors duration-150" href="#">Support</Link>
            <Link className="font-body text-xs uppercase tracking-widest text-[#f3ffca] hover:text-[#fc8700] transition-colors duration-150" href="#">Status</Link>
          </div>
        </div>
      </footer>

      {/* FAB for mobile focus */}
      <div className="fixed bottom-8 right-8 md:hidden">
        <Link href="/" className="w-16 h-16 bg-primary text-on-primary-container shadow-[6px_6px_0px_0px_rgba(146,76,0,1)] flex items-center justify-center active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all">
          <span className="material-symbols-outlined scale-150 font-bold">add</span>
        </Link>
      </div>
    </>
  );
}
