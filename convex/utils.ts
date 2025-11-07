export function getCrypto(): Crypto {
  const cryptoObj = (globalThis.crypto ?? (globalThis as any).webcrypto) as Crypto | undefined;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error("Secure random number generator is not available");
  }

  return cryptoObj;
}

export function generateRandomString(length: number): string {
  if (length <= 0) {
    throw new Error("Random string length must be greater than zero");
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  const cryptoObj = getCrypto();
  cryptoObj.getRandomValues(bytes);
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(bytes[i] % chars.length);
  }

  return result;
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidTagName(tagName: string): boolean {
  const tagNameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
  return tagNameRegex.test(tagName);
}

export function validateDisplayName(displayName: string): void {
  if (displayName.length < 2 || displayName.length > 50) {
    throw new Error("Display name must be between 2 and 50 characters");
  }
}
