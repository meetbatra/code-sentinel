import type { PrismaClient } from "@/generated/prisma";
import {
  assertEncryptionKeyConfigured,
  decryptApiKey,
} from "@/lib/crypto/api-keys";
import type { Prisma } from "@/generated/prisma";

type GetSecretParams = {
  userId: string;
  keyName: string;
  db: PrismaClient;
};

export async function getSecret(params: GetSecretParams): Promise<string> {
  assertEncryptionKeyConfigured();
  const key = await params.db.userApiKey.findFirst({
    where: {
      userId: params.userId,
      name: params.keyName,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      service: true,
      encryptedValue: true,
      iv: true,
      authTag: true,
      keyVersion: true,
    },
  });

  if (!key) {
    throw new Error(`Secret ${params.keyName} not found`);
  }

  await params.db.$transaction([
    params.db.userApiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    }),
    params.db.usage.create({
      data: {
        userId: params.userId,
        points: 0,
        operation: "api_key_read",
        metadata: {
          keyId: key.id,
          keyName: key.name,
          service: key.service,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  return decryptApiKey({
    encryptedValue: key.encryptedValue,
    iv: key.iv,
    authTag: key.authTag,
    keyVersion: key.keyVersion,
  });
}
