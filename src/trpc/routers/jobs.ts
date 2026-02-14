import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { TRPCError } from "@trpc/server";

export const jobsRouter = createTRPCRouter({
  getById: baseProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Find user by Clerk ID
      const user = await ctx.prisma.user.findUnique({
        where: { clerkId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not found",
        });
      }

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.id },
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found",
        });
      }

      if (job.userId !== user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this job",
        });
      }

      return job;
    }),

  list: baseProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        status: z
          .enum([
            "PENDING",
            "ANALYZING",
            "SETTING_UP",
            "TESTING",
            "COMPLETED",
            "FAILED",
          ])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Find user by Clerk ID
      const user = await ctx.prisma.user.findUnique({
        where: { clerkId: ctx.userId },
      });

      if (!user) {
        return {
          jobs: [],
          nextCursor: undefined,
        };
      }

      const jobs = await ctx.prisma.job.findMany({
        where: {
          userId: user.id,
          ...(input.status && { status: input.status }),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          repository: true,
          _count: {
            select: {
              tests: true,
              bugs: true,
            },
          },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (jobs.length > input.limit) {
        const nextItem = jobs.pop();
        nextCursor = nextItem!.id;
      }

      return {
        jobs,
        nextCursor,
      };
    }),

  delete: baseProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // Find user by Clerk ID
      const user = await ctx.prisma.user.findUnique({
        where: { clerkId: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

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


