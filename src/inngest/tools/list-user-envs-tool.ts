import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma";
import { listUserEnvs } from "@/inngest/tools/list-user-envs";

type CreateListUserEnvsToolOptions = {
  userId: string;
  db: PrismaClient;
};

export const createListUserEnvsTool = ({
  userId,
  db,
}: CreateListUserEnvsToolOptions) => {
  return createTool({
    name: "listUserEnvs",
    description:
      "List available user API key names (metadata only, never secret values).",
    parameters: z.object({}),
    handler: async (_params, { step: toolStep }) => {
      const result = await toolStep?.run("list-user-envs", async () => {
        return listUserEnvs({ userId, db });
      });

      return JSON.stringify(result ?? { available: [], lastUsed: {}, serviceMapping: {} });
    },
  });
};
