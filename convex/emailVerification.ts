"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateVerificationCode } from "./totp";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const VERIFICATION_CODE_EXPIRY = 15 * 60 * 1000; // 15 minutes

export const sendVerificationEmail = action({
  args: {
    accountId: v.id("tempAccounts"),
    email: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, { accountId, email, displayName }) => {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }

    const verificationCode = generateVerificationCode();
    
    // Store verification code in database
    await ctx.runMutation(internal.auth.setTempVerificationCode, {
      accountId,
      code: verificationCode,
      expiryTime: Date.now() + VERIFICATION_CODE_EXPIRY,
    });

    const resend = new Resend(RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: "VEB <hi@no-reply.overload.studio>",
      to: email,
      subject: "Verify your VEB account",
      html: `
        <h2>Welcome to VEB, ${displayName}!</h2>
        <p>Your verification code is: <strong>${verificationCode}</strong></p>
        <p>This code will expire in 15 minutes.</p>
        <p>If you didn't create a VEB account, please ignore this email.</p>
      `,
    });

    if (error) {
      throw new Error(`Failed to send verification email: ${error.message ?? error.name ?? "Unknown error"}`);
    }

    return true;
  },
});