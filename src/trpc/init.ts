import { initTRPC } from '@trpc/server';
import { cache } from 'react';
import superjson from "superjson";
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const createTRPCContext = cache(async () => {
    const { userId } = await auth();

    return {
        userId: userId || null,
        prisma,
    };
});

type Context = Awaited<ReturnType<typeof createTRPCContext>>;
export type TRPCContext = Context;

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<Context>().create({
    /**
     * @see https://trpc.io/docs/server/data-transformers
     */
    transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;
