import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { inngest } from "@/inngest/client";
import { jobsRouter } from "./jobs";
import { githubRouter } from "./github";
import { repositoriesRouter } from "./repositories";
import { TRPCError } from "@trpc/server";

export const appRouter = createTRPCRouter({
  github: githubRouter,
  jobs: jobsRouter,
  repositories: repositoriesRouter,

  testAgent: createTRPCRouter({
    run: baseProcedure
      .input(
        z.object({
          repoOwner: z.string(),
          repoName: z.string(),
          repoUrl: z.string().url(),
          bugDescription: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          if (!ctx.userId) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "You must be signed in to run tests"
            });
          }

          console.log("Clerk userId:", ctx.userId);

          // First, ensure User exists in database (find or create by Clerk ID)
          const user = await ctx.prisma.user.upsert({
            where: {
              clerkId: ctx.userId,
            },
            create: {
              clerkId: ctx.userId,
            },
            update: {},
          });

          console.log("User found/created:", user.id);

          // Find or create repository
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

          console.log("Repository created/found:", repository.id);

          // Create job
          const job = await ctx.prisma.job.create({
            data: {
              userId: user.id,
              repositoryId: repository.id,
              status: "PENDING",
              bugDescription: input.bugDescription,
            },
          });

          console.log("Job created:", job.id);

          // Trigger Inngest
          await inngest.send({
            name: "test-agent/run",
            data: {
              jobId: job.id,
              userId: user.id,
              repositoryId: repository.id,
              repoUrl: input.repoUrl,
              bugDescription: input.bugDescription,
            },
          });

          console.log("Inngest event sent for job:", job.id);

          return { jobId: job.id };
        } catch (error) {
          console.error("Error in testAgent.run:", error);

          if (error instanceof TRPCError) {
            throw error;
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to create test job",
            cause: error,
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
