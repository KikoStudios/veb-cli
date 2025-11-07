import { getCrypto } from "./utils";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateBase32(length = 32): string {
  if (length <= 0) {
    throw new Error("Base32 secret length must be greater than zero");
  }

  const bytes = new Uint8Array(length);
  const cryptoObj = getCrypto();
  cryptoObj.getRandomValues(bytes);

  let secret = "";
  for (let i = 0; i < bytes.length; i++) {
    const value = bytes[i] ?? 0;
    const index = value & 31;
    secret += BASE32_ALPHABET.charAt(index % BASE32_ALPHABET.length);
  }

  return secret;
}

export function base32ToBytes(secret: string): Uint8Array {
  if (!secret) {
    throw new Error("Base32 secret is required");
  }

  const normalized = secret.replace(/=+$/g, "").toUpperCase();
  let bitStream = "";

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid character in Base32 secret");
    }
    bitStream += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bitStream.length; i += 8) {
    bytes.push(parseInt(bitStream.slice(i, i + 8), 2));
  }

  return Uint8Array.from(bytes);
}
