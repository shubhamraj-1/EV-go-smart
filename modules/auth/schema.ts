import { z } from "zod";

export const signInSchema = z
  .object({
    email: z.email().min(3).max(254),
    password: z.string().min(1).max(128),
    redirectTo: z.string().optional(),
  })
  .strict();

export const signUpSchema = z
  .object({
    email: z.email().min(3).max(254),
    password: z.string().min(12).max(128),
    fullName: z.string().min(2).max(100),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.email().min(3).max(254),
  })
  .strict();

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * HIBP k-anonymity check — Supabase Free has no leaked-password protection.
 * Sends only the SHA-1 prefix; never the password itself.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-1", encoder.encode(password));
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
  });

  if (!res.ok) return false; // Fail open — do not block sign-up on HIBP outage.

  const text = await res.text();
  return text
    .split("\n")
    .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix);
}
