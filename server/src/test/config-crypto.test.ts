import { Buffer } from "node:buffer";
import { describe, expect, it } from "vite-plus/test";
import { decryptSecret, encryptSecret, requireConfigEncryptionKey } from "../lib/config-crypto.js";

const validKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const validKeyBase64 = validKey.toString("base64");
type ConfigEnv = Parameters<typeof requireConfigEncryptionKey>[0];

type SecretEnvelope = {
  v: number;
  iv: string;
  tag: string;
  ct: string;
};

function parseEnvelope(envelope: string): SecretEnvelope {
  return JSON.parse(envelope) as SecretEnvelope;
}

function tamperBase64Field(envelope: string, field: "tag" | "ct"): string {
  const parsed = parseEnvelope(envelope);
  const bytes = Buffer.from(parsed[field], "base64");
  bytes[0] ^= 0xff;
  return JSON.stringify({ ...parsed, [field]: bytes.toString("base64") });
}

describe("requireConfigEncryptionKey", () => {
  it("loads a 32-byte base64 key from CONFIG_ENCRYPTION_KEY", () => {
    const key = requireConfigEncryptionKey({
      CONFIG_ENCRYPTION_KEY: validKeyBase64,
    } as ConfigEnv);

    expect(key).toEqual(validKey);
  });

  it("loads the fixed test setup key from process.env", () => {
    const key = requireConfigEncryptionKey();

    expect(key.byteLength).toBe(32);
  });

  it("throws a clear error when CONFIG_ENCRYPTION_KEY is missing", () => {
    expect(() => requireConfigEncryptionKey({} as ConfigEnv)).toThrow(
      /CONFIG_ENCRYPTION_KEY is required/,
    );
  });

  it("throws a clear error when CONFIG_ENCRYPTION_KEY is not 32 decoded bytes", () => {
    expect(() =>
      requireConfigEncryptionKey({
        CONFIG_ENCRYPTION_KEY: Buffer.from("too-short").toString("base64"),
      } as ConfigEnv),
    ).toThrow(/CONFIG_ENCRYPTION_KEY must be a base64-encoded 32-byte key/);
  });
});

describe("config secret encryption", () => {
  it("encrypts secrets into the v1 JSON envelope with base64 fields", () => {
    const plaintext = "runtime config secret";
    const envelope = encryptSecret(plaintext, validKey);
    const parsed = parseEnvelope(envelope);

    expect(parsed.v).toBe(1);
    expect(Buffer.from(parsed.iv, "base64").byteLength).toBe(12);
    expect(Buffer.from(parsed.tag, "base64").byteLength).toBe(16);
    expect(Buffer.from(parsed.ct, "base64").byteLength).toBeGreaterThan(0);
    expect(envelope).not.toContain(plaintext);
  });

  it("produces unique ciphertext for the same plaintext and key", () => {
    const first = parseEnvelope(encryptSecret("same secret", validKey));
    const second = parseEnvelope(encryptSecret("same secret", validKey));

    expect(first.iv).not.toBe(second.iv);
    expect(first.ct).not.toBe(second.ct);
  });

  it("round-trips encrypted secrets", () => {
    const plaintext = "strava proxy api key";
    const envelope = encryptSecret(plaintext, validKey);

    expect(decryptSecret(envelope, validKey)).toBe(plaintext);
  });

  it("fails when the authentication tag is tampered", () => {
    const envelope = encryptSecret("do not decrypt", validKey);

    expect(() => decryptSecret(tamperBase64Field(envelope, "tag"), validKey)).toThrow();
  });

  it("fails when the ciphertext is tampered", () => {
    const envelope = encryptSecret("do not decrypt", validKey);

    expect(() => decryptSecret(tamperBase64Field(envelope, "ct"), validKey)).toThrow();
  });
});
