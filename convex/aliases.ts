import { v, ConvexError } from "convex/values";
import { query, mutation, action } from "./_generated/server";

export const getAlias = query({
  args: {
    alias: v.string(),
  },
  handler: async (ctx, { alias }) => {
    const normalized = alias.toLowerCase().trim();
    return ctx.db
      .query("aliases")
      .withIndex("by_alias", (q) => q.eq("alias", normalized))
      .first();
  },
});

export const getAliasByUrl = query({
  args: {
    repoUrl: v.string(),
  },
  handler: async (ctx, { repoUrl }) => {
    const normalized = repoUrl.toLowerCase().trim();
    return ctx.db
      .query("aliases")
      .withIndex("by_repoUrl", (q) => q.eq("repoUrl", normalized))
      .first();
  },
});

export const createAlias = mutation({
  args: {
    alias: v.string(),
    repoUrl: v.string(),
  },
  handler: async (ctx, { alias, repoUrl }) => {
    const normalized = alias.toLowerCase().trim();
    const normalizedUrl = repoUrl.toLowerCase().trim();

    const existing = await ctx.db
      .query("aliases")
      .withIndex("by_alias", (q) => q.eq("alias", normalized))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        repoUrl: normalizedUrl,
        lastUsedAt: Date.now(),
      });
      return existing._id;
    }

    return ctx.db.insert("aliases", {
      alias: normalized,
      repoUrl: normalizedUrl,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
  },
});

export const updateLastUsed = mutation({
  args: {
    aliasId: v.id("aliases"),
  },
  handler: async (ctx, { aliasId }) => {
    await ctx.db.patch(aliasId, {
      lastUsedAt: Date.now(),
    });
  },
});

