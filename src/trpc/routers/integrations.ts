import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { assertEncryptionKeyConfigured, encryptApiKey } from "@/lib/crypto/api-keys";
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

async function recordKeyAudit(
  ctx: TRPCContext,
  userId: string,
  operation: string,
  metadata: Record<string, unknown>
) {
  await ctx.prisma.usage.create({
    data: {
      userId,
      operation,
      points: 0,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

function requireEncryptionKeyForWrite() {
  try {
    assertEncryptionKeyConfigured();
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Vault is not configured. Set ENCRYPTION_KEY (64 hex chars) in your server environment and restart.",
    });
  }
}

export const integrationsRouter = createTRPCRouter({
  listKeys: baseProcedure.query(async ({ ctx }) => {
    const user = await requireUser(ctx);

    return ctx.prisma.userApiKey.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        service: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  createKey: baseProcedure
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(128)
          .regex(
            /^[A-Z][A-Z0-9_]*$/,
            "Name must start with a capital letter and use only A-Z, 0-9, and underscores."
          ),
        value: z.string().min(1).max(4096),
        service: z.string().trim().max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireEncryptionKeyForWrite();
      const user = await requireUser(ctx);
      const encrypted = encryptApiKey(input.value);

      try {
        const created = await ctx.prisma.userApiKey.create({
          data: {
            userId: user.id,
            name: input.name,
            service: input.service || null,
            encryptedValue: encrypted.encryptedValue,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            keyVersion: encrypted.keyVersion,
          },
          select: {
            id: true,
            name: true,
            service: true,
            createdAt: true,
            updatedAt: true,
            lastUsedAt: true,
          },
        });

        await recordKeyAudit(ctx, user.id, "api_key_create", {
          keyId: created.id,
          keyName: created.name,
          service: created.service,
        });

        return created;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A key with this name already exists.",
          });
        }

        throw error;
      }
    }),

  updateKey: baseProcedure
    .input(
      z.object({
        keyId: z.string().uuid(),
        value: z.string().min(1).max(4096),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireEncryptionKeyForWrite();
      const user = await requireUser(ctx);
      const encrypted = encryptApiKey(input.value);

      const existing = await ctx.prisma.userApiKey.findFirst({
        where: {
          id: input.keyId,
          userId: user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          service: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }

      const updated = await ctx.prisma.userApiKey.update({
        where: { id: existing.id },
        data: {
          encryptedValue: encrypted.encryptedValue,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        },
        select: {
          id: true,
          name: true,
          service: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
        },
      });

      await recordKeyAudit(ctx, user.id, "api_key_update", {
        keyId: updated.id,
        keyName: updated.name,
        service: updated.service,
      });

      return updated;
    }),

  deleteKey: baseProcedure
    .input(
      z.object({
        keyId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await requireUser(ctx);
      const existing = await ctx.prisma.userApiKey.findFirst({
        where: {
          id: input.keyId,
          userId: user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          service: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }

      await ctx.prisma.userApiKey.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await recordKeyAudit(ctx, user.id, "api_key_delete", {
        keyId: existing.id,
        keyName: existing.name,
        service: existing.service,
      });

      return { success: true };
    }),
});
