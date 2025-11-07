import { ConvexError } from "convex/values";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha512 } from "@noble/hashes/sha512";
import { getCrypto } from "./utils";

const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PBKDF2_ITERATIONS = 210_000;

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const output = new Uint8Array(hex.length / 2);
  for (let i = 0; i < output.length; i++) {
    output[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return output;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const cryptoObj = getCrypto();
  const salt = new Uint8Array(SALT_BYTES);
  cryptoObj.getRandomValues(salt);

  const derivedKey = pbkdf2(sha512, encoder.encode(password), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_BYTES,
  });

  return `${toHex(salt)}:${toHex(derivedKey)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof hash !== "string" || !hash.includes(":")) {
    return false;
  }

  const [saltHex, keyHex] = hash.split(":");
  try {
    const salt = fromHex(saltHex);
    const expectedKey = fromHex(keyHex);
    const derivedKey = pbkdf2(sha512, encoder.encode(password), salt, {
      c: PBKDF2_ITERATIONS,
      dkLen: expectedKey.length,
    });
    return timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new ConvexError("Password must be at least 8 characters long");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ConvexError("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    throw new ConvexError("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    throw new ConvexError("Password must contain at least one number");
  }
}