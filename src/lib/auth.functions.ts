// src/lib/auth.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClient } from "@/integrations/supabase/auth-middleware";

/**
 * Server function that signs a user in with email & password.
 * On success it throws a redirect to the dashboard (or any protected route).
 * On failure it returns an object { success: false, error: string }.
 */
export const signInWithEmail = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Successful login – redirect to the dashboard.
    // Throwing a redirect causes TanStack Start to issue a 302 response.
    throw redirect({ to: "/dashboard" });
  });
