import { v, ConvexError } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashPassword, validatePassword, verifyPassword } from "./passwords";
import { generateTOTPSecret, verifyTOTPCode } from "./totp";
import { isValidEmail, isValidTagName, validateDisplayName, generateRandomString } from "./utils";

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
const TEMP_ACCOUNT_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const register = action({
  args: {
    displayName: v.string(),
    tagName: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { displayName, tagName, email, password }) => {
    validateDisplayName(displayName);
    if (!isValidTagName(tagName)) {
      throw new ConvexError("Invalid tag name format");
    }
    if (!isValidEmail(email)) {
      throw new ConvexError("Invalid email format");
    }
    validatePassword(password);

    await ctx.runMutation(internal.auth.purgeExpiredTempAccounts, {
      before: Date.now() - TEMP_ACCOUNT_TTL,
    });

    const existing = await ctx.runQuery(internal.auth.findExistingAccount, {
      tagName,
      email,
    });

    if (existing) {
      throw new ConvexError(existing.message);
    }

    const passwordHash = await hashPassword(password);

    const tempAccountId = await ctx.runMutation(internal.auth.createTempAccount, {
      displayName,
      tagName,
      email,
      passwordHash,
    });

    return tempAccountId;
  },
});

export const createTempAccount = mutation({
  args: {
    displayName: v.string(),
    tagName: v.string(),
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, { displayName, tagName, email, passwordHash }) => {
    return ctx.db.insert("tempAccounts", {
      displayName,
      tagName,
      email,
      passwordHash,
      createdAt: Date.now(),
    });
  },
});

export const purgeExpiredTempAccounts = mutation({
  args: {
    before: v.number(),
  },
  handler: async (ctx, { before }) => {
    const expired = await ctx.db
      .query("tempAccounts")
      .filter((q) => q.lt(q.field("createdAt"), before))
      .collect();

    for (const account of expired) {
      await ctx.db.delete(account._id);
    }
  },
});

export const findExistingAccount = query({
  args: {
    tagName: v.string(),
    email: v.string(),
  },
  handler: async (ctx, { tagName, email }) => {
    const existingTagUser = await ctx.db
      .query("users")
      .withIndex("by_tagName", (q) => q.eq("tagName", tagName))
      .first();

    if (existingTagUser) {
      return { message: "Username already exists" } as const;
    }

    const existingEmailUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingEmailUser) {
      return { message: "Email already exists" } as const;
    }

    const existingTagPending = await ctx.db
      .query("tempAccounts")
      .withIndex("by_tagName", (q) => q.eq("tagName", tagName))
      .first();

    if (existingTagPending) {
      return { message: "Username is awaiting verification" } as const;
    }

    const existingEmailPending = await ctx.db
      .query("tempAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingEmailPending) {
      return { message: "Email is awaiting verification" } as const;
    }

    return null;
  },
});

export const getTempAccount = query({
  args: {
    accountId: v.id("tempAccounts"),
  },
  handler: async (ctx, { accountId }) => {
    return ctx.db.get(accountId);
  },
});

export const getUserForLogin = query({
  args: {
    identifier: v.string(),
  },
  handler: async (ctx, { identifier }) => {
    return ctx.db
      .query("users")
      .filter((q) => q.or(
        q.eq(q.field("tagName"), identifier),
        q.eq(q.field("email"), identifier)
      ))
      .first();
  },
});

export const setTempVerificationCode = mutation({
  args: {
    accountId: v.id("tempAccounts"),
    code: v.string(),
    expiryTime: v.number(),
  },
  handler: async (ctx, { accountId, code, expiryTime }) => {
    await ctx.db.patch(accountId, {
      verificationCode: code,
      verificationCodeExpiry: expiryTime,
    });
  },
});

export const promoteTempAccount = mutation({
  args: {
    accountId: v.id("tempAccounts"),
    totpSecret: v.string(),
  },
  handler: async (ctx, { accountId, totpSecret }) => {
    const account = await ctx.db.get(accountId);
    if (!account) {
      throw new ConvexError("Verification request not found");
    }

    const userId = await ctx.db.insert("users", {
      displayName: account.displayName,
      tagName: account.tagName,
      email: account.email,
      passwordHash: account.passwordHash,
      isEmailVerified: true,
      totpSecret,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.delete(accountId);

    return {
      userId,
      displayName: account.displayName,
      tagName: account.tagName,
      email: account.email,
    } as const;
  },
});

export const verifyEmail = action({
  args: {
    accountId: v.id("tempAccounts"),
    code: v.string(),
  },
  handler: async (ctx, { accountId, code }) => {
    const account = await ctx.runQuery(internal.auth.getTempAccount, { accountId });
    if (!account) {
      throw new ConvexError("Verification request not found");
    }

    if (!account.verificationCode || !account.verificationCodeExpiry) {
      throw new ConvexError("No verification code found");
    }

    if (Date.now() > account.verificationCodeExpiry) {
      throw new ConvexError("Verification code expired");
    }

    if (account.verificationCode !== code) {
      throw new ConvexError("Invalid verification code");
    }

    const totpSetup = generateTOTPSecret(account.tagName || account.email);

    await ctx.runMutation(internal.auth.promoteTempAccount, {
      accountId,
      totpSecret: totpSetup.secret,
    });

    return totpSetup;
  },
});

export const createSession = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    lastUsedAt: v.number(),
  },
  handler: async (ctx, { userId, token, expiresAt, lastUsedAt }) => {
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt,
      lastUsedAt,
    });
  },
});

export const login = action({
  args: {
    identifier: v.string(),
    password: v.string(),
    totpCode: v.string(),
  },
  handler: async (ctx, { identifier, password, totpCode }) => {
    const user = await ctx.runQuery(internal.auth.getUserForLogin, { identifier });

    if (!user) {
      throw new ConvexError("Invalid credentials");
    }

    if (!user.isEmailVerified) {
      throw new ConvexError("Email address has not been verified");
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new ConvexError("Invalid credentials");
    }

    if (!user.totpSecret || !verifyTOTPCode(user.totpSecret, totpCode)) {
      throw new ConvexError("Invalid 2FA code");
    }

    const sessionToken = generateRandomString(32);
    const expiresAt = Date.now() + SESSION_DURATION;

    await ctx.runMutation(internal.auth.createSession, {
      userId: user._id,
      token: sessionToken,
      expiresAt,
      lastUsedAt: Date.now(),
    });

    return {
      sessionToken,
      user: {
        id: user._id,
        displayName: user.displayName,
        tagName: user.tagName,
        email: user.email,
      },
    };
  },
});