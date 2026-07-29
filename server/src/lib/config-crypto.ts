import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type SecretEnvelope = {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
};

function decodeBase64(value: string, label: string): Buffer {
  if (!BASE64_PATTERN.test(value)) {
    throw new Error(`${label} must be base64 encoded`);
  }
  return Buffer.from(value, "base64");
}

function assertConfigKey(key: Buffer): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new Error("CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
}

function parseEnvelope(envelope: string): SecretEnvelope {
  let parsed: unknown;

  try {
    parsed = JSON.parse(envelope);
  } catch {
    throw new Error("Secret envelope must be valid JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as Partial<SecretEnvelope>).v !== 1 ||
    typeof (parsed as Partial<SecretEnvelope>).iv !== "string" ||
    typeof (parsed as Partial<SecretEnvelope>).tag !== "string" ||
    typeof (parsed as Partial<SecretEnvelope>).ct !== "string"
  ) {
    throw new Error("Secret envelope must have v:1 and base64 iv, tag, and ct fields");
  }

  return parsed as SecretEnvelope;
}

export function requireConfigEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const encoded = env.CONFIG_ENCRYPTION_KEY?.trim();

  if (!encoded) {
    throw new Error("CONFIG_ENCRYPTION_KEY is required");
  }

  const key = decodeBase64(encoded, "CONFIG_ENCRYPTION_KEY");
  assertConfigKey(key);
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  assertConfigKey(key);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: authTag.toString("base64"),
    ct: ciphertext.toString("base64"),
  } satisfies SecretEnvelope);
}

export function decryptSecret(envelope: string, key: Buffer): string {
  assertConfigKey(key);

  const parsed = parseEnvelope(envelope);
  const iv = decodeBase64(parsed.iv, "Secret envelope iv");
  const authTag = decodeBase64(parsed.tag, "Secret envelope tag");
  const ciphertext = decodeBase64(parsed.ct, "Secret envelope ct");

  if (iv.byteLength !== IV_BYTES) {
    throw new Error("Secret envelope iv must decode to 12 bytes");
  }
  if (authTag.byteLength !== AUTH_TAG_BYTES) {
    throw new Error("Secret envelope tag must decode to 16 bytes");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
