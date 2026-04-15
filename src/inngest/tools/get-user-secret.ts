import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma";
import { getSecret } from "@/inngest/tools/get-secret";

type CreateGetUserSecretToolOptions = {
  userId: string;
  db: PrismaClient;
};

const paramsSchema = z.object({
  keyName: z
    .string()
    .trim()
    .min(1)
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Key name must start with a capital letter and use only A-Z, 0-9, and underscores."
    ),
});

export const createGetUserSecretTool = ({
  userId,
  db,
}: CreateGetUserSecretToolOptions) => {
  return createTool({
    name: "getUserSecret",
    description:
      "Resolve one API key value from secure vault by key name for runtime test setup.",
    parameters: paramsSchema,
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const result = await toolStep?.run("get-user-secret", async () => {
        return getSecret({
          userId,
          keyName: parsed.data.keyName,
          db,
        });
      });

      if (!result) {
        return "Error: Secret could not be retrieved";
      }

      return result;
    },
  });
};
