import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const AES_256_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;

let cachedEncryptionKey: Buffer | null = null;

function resolveEncryptionKey(): Buffer {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is required");
  }

  if (!/^[a-fA-F0-9]{64}$/.test(raw)) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }

  const key = Buffer.from(raw, "hex");
  if (key.byteLength !== AES_256_KEY_BYTES) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  cachedEncryptionKey = key;
  return cachedEncryptionKey;
}

export type EncryptedApiKeyPayload = {
  encryptedValue: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export function encryptApiKey(
  plainText: string,
  keyVersion = 1
): EncryptedApiKeyPayload {
  if (!plainText) {
    throw new Error("API key value cannot be empty");
  }

  const key = resolveEncryptionKey();
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encryptedValue = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encryptedValue.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
  };
}

export function decryptApiKey(payload: EncryptedApiKeyPayload): string {
  const key = resolveEncryptionKey();
  const iv = Buffer.from(payload.iv, "base64");
  const encryptedValue = Buffer.from(payload.encryptedValue, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const plainText = Buffer.concat([
    decipher.update(encryptedValue),
    decipher.final(),
  ]);

  return plainText.toString("utf8");
}

export function assertEncryptionKeyConfigured(): void {
  resolveEncryptionKey();
}
