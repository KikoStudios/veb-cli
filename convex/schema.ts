import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    displayName: v.string(),
    tagName: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    totpSecret: v.optional(v.string()),
    isEmailVerified: v.boolean(),
    verificationCode: v.optional(v.string()),
    verificationCodeExpiry: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tagName", ["tagName"])
    .index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  tempAccounts: defineTable({
    displayName: v.string(),
    tagName: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    verificationCode: v.optional(v.string()),
    verificationCodeExpiry: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tagName", ["tagName"])
    .index("by_email", ["email"]),

  aliases: defineTable({
    alias: v.string(),
    repoUrl: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_alias", ["alias"])
    .index("by_repoUrl", ["repoUrl"]),
});
