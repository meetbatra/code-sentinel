import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { baseProcedure, createTRPCRouter } from "../init";
import { inngest } from "@/inngest/client";
import type { TRPCContext } from "../init";
import { Prisma } from "@/generated/prisma";

const activeStatuses = ["PENDING", "ANALYZING", "SETTING_UP", "TESTING"] as const;

async function requireUser(ctx: TRPCContext) {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  try {
    const user = await ctx.prisma.user.upsert({
      where: { clerkId: ctx.userId },
      create: { clerkId: ctx.userId },
      update: {},
    });

    return user;
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to resolve signed-in user",
      cause: error,
    });
  }
}

export const jobsRouter = createTRPCRouter({
  getById: baseProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      try {
        const job = await ctx.prisma.job.findFirst({
          where: { id: input.id, userId: user.id },
          include: {
            repository: true,
            tests: {
              orderBy: { createdAt: "desc" },
            },
            bugs: {
              orderBy: { createdAt: "desc" },
            },
          },
        });

        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }

        return job;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          console.error("jobs.getById: prisma known request error", {
            input,
            userId: user.id,
            code: error.code,
            message: error.message,
          });

          if (error.code === "P2022") {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "Database schema and Prisma client are out of sync. Run `prisma migrate` and `prisma generate`, then restart the server.",
              cause: error,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database error while loading job details",
            cause: error,
          });
        }

        console.error("jobs.getById: unexpected error", {
          input,
          userId: user.id,
          error,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to load job details",
          cause: error,
        });
      }
    }),

  list: baseProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        repositoryId: z.string().optional(),
        status: z
          .enum(["PENDING", "ANALYZING", "SETTING_UP", "TESTING", "COMPLETED", "FAILED"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      const jobs = await ctx.prisma.job.findMany({
        where: {
          userId: user.id,
          ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          repository: true,
          tests: {
            select: { status: true },
          },
          _count: { select: { tests: true, bugs: true } },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (jobs.length > input.limit) {
        const nextItem = jobs.pop();
        nextCursor = nextItem?.id;
      }

      return { jobs, nextCursor };
    }),

  overview: baseProcedure.query(async ({ ctx }) => {
    const user = await requireUser(ctx);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalRepositories, activeRuns, bugsToday, recentFailures] = await Promise.all([
      ctx.prisma.repository.count({ where: { userId: user.id } }),
      ctx.prisma.job.count({
        where: {
          userId: user.id,
          status: { in: [...activeStatuses] },
        },
      }),
      ctx.prisma.bug.count({
        where: {
          createdAt: { gte: todayStart },
          job: { userId: user.id },
        },
      }),
      ctx.prisma.job.findMany({
        where: { userId: user.id, status: "FAILED" },
        take: 8,
        orderBy: { updatedAt: "desc" },
        include: {
          repository: true,
          _count: { select: { bugs: true, tests: true } },
        },
      }),
    ]);

    return {
      totalRepositories,
      activeRuns,
      bugsToday,
      recentFailures,
    };
  }),

  compareRuns: baseProcedure
    .input(
      z.object({
        baseRunId: z.string(),
        compareRunId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      const [baseRun, compareRun] = await Promise.all([
        ctx.prisma.job.findUnique({
          where: { id: input.baseRunId },
          include: { bugs: true, repository: true, tests: true },
        }),
        ctx.prisma.job.findUnique({
          where: { id: input.compareRunId },
          include: { bugs: true, repository: true, tests: true },
        }),
      ]);

      if (!baseRun || !compareRun) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
      }
      if (baseRun.userId !== user.id || compareRun.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (baseRun.repositoryId !== compareRun.repositoryId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Runs must belong to same repository",
        });
      }

      const bugKey = (bug: { sourceFile: string | null; message: string }) =>
        `${bug.sourceFile ?? "unknown"}::${bug.message}`;
      const baseKeys = new Set(baseRun.bugs.map(bugKey));
      const compareKeys = new Set(compareRun.bugs.map(bugKey));

      const newBugs = compareRun.bugs.filter((bug) => !baseKeys.has(bugKey(bug)));
      const fixedBugs = baseRun.bugs.filter((bug) => !compareKeys.has(bugKey(bug)));
      const unchangedBugs = compareRun.bugs.filter((bug) => baseKeys.has(bugKey(bug)));

      return {
        repository: compareRun.repository,
        baseRun: {
          id: baseRun.id,
          createdAt: baseRun.createdAt,
          status: baseRun.status,
          bugCount: baseRun.bugs.length,
          testCount: baseRun.tests.length,
        },
        compareRun: {
          id: compareRun.id,
          createdAt: compareRun.createdAt,
          status: compareRun.status,
          bugCount: compareRun.bugs.length,
          testCount: compareRun.tests.length,
        },
        newBugs,
        fixedBugs,
        unchangedBugs,
      };
    }),

  rerun: baseProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      const existingJob = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
        include: { repository: true },
      });

      if (!existingJob) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (existingJob.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const job = await ctx.prisma.job.create({
        data: {
          userId: user.id,
          repositoryId: existingJob.repositoryId,
          status: "PENDING",
          bugDescription: existingJob.bugDescription,
        },
      });

      await inngest.send({
        name: "test-agent/run",
        data: {
          jobId: job.id,
          userId: user.id,
          repositoryId: existingJob.repositoryId,
          repoUrl: existingJob.repository.repoUrl,
          bugDescription: existingJob.bugDescription,
        },
      });

      return { jobId: job.id };
    }),

  cancel: baseProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
      });

      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (job.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (!activeStatuses.includes(job.status as (typeof activeStatuses)[number])) {
        return { success: false, message: "Job is not running" };
      }

      // Signal Inngest to cancel any in-flight execution for this job.
      await inngest.send({
        name: "test-agent/cancel",
        data: {
          jobId: job.id,
          userId: user.id,
        },
      });

      await ctx.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          summary: "Canceled by user.",
        },
      });

      return { success: true };
    }),

  delete: baseProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.id },
      });

      if (!job || job.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.prisma.job.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
