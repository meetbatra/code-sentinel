import { z } from "zod";
import { baseProcedure, createTRPCRouter } from "../init";
import { inngest } from "@/inngest/client";

export const appRouter = createTRPCRouter({
    testAgent: createTRPCRouter({
        run: baseProcedure
            .input(
                z.object({
                    repoUrl: z.string().url(),
                    value: z.string().min(1),
                })
            )
            .mutation(async ({ input }) => {
                await inngest.send({
                    name: "test-agent/run",
                    data: {
                        repoUrl: input.repoUrl,
                        value: input.value, // user error description
                    },
                });

                return { ok: true };
            }),
    }),
});

export type AppRouter = typeof appRouter;
