import type { PrismaClient } from "@/generated/prisma";

type ListUserEnvsParams = {
  userId: string;
  db: PrismaClient;
};

export async function listUserEnvs(params: ListUserEnvsParams): Promise<{
  available: string[];
  lastUsed: Record<string, string>;
  serviceMapping: Record<string, string>;
}> {
  const keys = await params.db.userApiKey.findMany({
    where: {
      userId: params.userId,
      deletedAt: null,
    },
    select: {
      name: true,
      service: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    available: keys.map((key) => key.name),
    lastUsed: Object.fromEntries(
      keys.map((key) => [key.name, key.lastUsedAt?.toISOString() ?? "never"])
    ),
    serviceMapping: Object.fromEntries(
      keys.map((key) => [key.name, key.service ?? "unknown"])
    ),
  };
}
