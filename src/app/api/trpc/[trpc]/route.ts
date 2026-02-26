import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@/trpc/init';
import { appRouter } from '@/trpc/routers/_app';
const handler = async (req: Request) => {
    try {
        return await fetchRequestHandler({
            endpoint: '/api/trpc',
            req,
            router: appRouter,
            createContext: createTRPCContext,
            onError({ path, error }) {
                console.error('tRPC handler error', {
                    path,
                    message: error.message,
                    code: error.code,
                    cause: error.cause,
                });
            },
        });
    } catch (error) {
        console.error('tRPC route fatal error', error);
        return new Response(
            JSON.stringify({
                error: 'Internal server error while handling tRPC request',
            }),
            {
                status: 500,
                headers: { 'content-type': 'application/json' },
            }
        );
    }
};
export { handler as GET, handler as POST };
