import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { baseProcedure, createTRPCRouter } from "../init";
import type { TRPCContext } from "../init";

async function requireUser(ctx: TRPCContext) {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return ctx.prisma.user.upsert({
    where: { clerkId: ctx.userId },
    create: { clerkId: ctx.userId },
    update: {},
  });
}

export const repositoriesRouter = createTRPCRouter({
  add: baseProcedure
    .input(
      z.object({
        repoOwner: z.string().min(1),
        repoName: z.string().min(1),
        repoUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      const repository = await ctx.prisma.repository.upsert({
        where: {
          userId_repoOwner_repoName: {
            userId: user.id,
            repoOwner: input.repoOwner,
            repoName: input.repoName,
          },
        },
        create: {
          userId: user.id,
          repoOwner: input.repoOwner,
          repoName: input.repoName,
          repoUrl: input.repoUrl,
        },
        update: {
          repoUrl: input.repoUrl,
        },
      });

      return repository;
    }),

  list: baseProcedure.query(async ({ ctx }) => {
    const user = await requireUser(ctx);

    const repositories = await ctx.prisma.repository.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        jobs: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            _count: { select: { tests: true, bugs: true } },
          },
        },
        _count: {
          select: { jobs: true },
        },
      },
    });

    return repositories.map((repository) => ({
      ...repository,
      latestJob: repository.jobs[0] ?? null,
    }));
  }),

  getById: baseProcedure
    .input(
      z.object({
        repositoryId: z.string(),
        historyLimit: z.number().min(5).max(100).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = await requireUser(ctx);

      const repository = await ctx.prisma.repository.findUnique({
        where: { id: input.repositoryId },
      });

      if (!repository) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }
      if (repository.userId !== user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const runs = await ctx.prisma.job.findMany({
        where: { repositoryId: repository.id },
        orderBy: { createdAt: "desc" },
        take: input.historyLimit,
        include: {
          tests: { orderBy: { createdAt: "desc" } },
          bugs: { orderBy: { createdAt: "desc" } },
          _count: { select: { bugs: true, tests: true } },
        },
      });

      return {
        repository,
        latestRun: runs[0] ?? null,
        runs,
      };
    }),
});
