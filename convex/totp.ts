import { hmac } from "@noble/hashes/hmac";
import { sha1 } from "@noble/hashes/sha1";
import { generateBase32, base32ToBytes } from "./customBase32";
import { getCrypto } from "./utils";

const STEP_SECONDS = 30;
const CODE_DIGITS = 6;
const ISSUER_NAME = "VEB";

export function generateTOTPSecret(
  accountLabel: string,
  issuer: string = ISSUER_NAME,
): { secret: string; uri: string; qrUrl: string } {
  const label = accountLabel.trim() || "user";
  const secret = generateBase32(32);
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  const qrUrl = `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(uri)}`;

  return { secret, uri, qrUrl };
}

export function generateTOTPCode(secret: string, time: number = Date.now()): string {
  const key = base32ToBytes(secret);
  const counter = Math.floor(time / 1000 / STEP_SECONDS);
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setBigUint64(0, BigInt(counter));

  const digest = hmac(sha1, key, counterBytes);
  const offset = digest[digest.length - 1] & 0x0f;

  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  const otp = binary % 10 ** CODE_DIGITS;
  return otp.toString().padStart(CODE_DIGITS, "0");
}

export function verifyTOTPCode(secret: string, code: string): boolean {
  if (!/^[0-9]{6}$/.test(code)) {
    return false;
  }

  const now = Date.now();

  for (let window = -1; window <= 1; window++) {
    const comparisonCode = generateTOTPCode(secret, now + window * STEP_SECONDS * 1000);
    if (comparisonCode === code) {
      return true;
    }
  }

  return false;
}

export function generateVerificationCode(): string {
  const bytes = new Uint8Array(CODE_DIGITS);
  const cryptoObj = getCrypto();
  cryptoObj.getRandomValues(bytes);

  let code = "";
  for (let i = 0; i < CODE_DIGITS; i++) {
    code += String(bytes[i] % 10);
  }

  return code;
}