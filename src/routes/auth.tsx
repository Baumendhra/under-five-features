import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — EduTrace" },
      {
        name: "description",
        content: "Sign in to EduTrace to import student records, verify APAAR IDs and catch duplicates.",
      },
      { property: "og:title", content: "Sign in — EduTrace" },
      {
        property: "og:description",
        content: "Sign in to EduTrace to import student records, verify APAAR IDs and catch duplicates.",
      },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5.04c1.62 0 3.06.56 4.2 1.64l3.12-3.12C17.4 1.72 14.94.72 12 .72 7.44.72 3.56 3.36 1.72 7.28l3.66 2.84C6.26 7.14 8.88 5.04 12 5.04Z"
      />
      <path
        fill="#4285F4"
        d="M23.28 12.26c0-.8-.08-1.56-.2-2.26H12v4.52h6.34c-.28 1.48-1.1 2.74-2.34 3.58l3.6 2.8c2.1-1.94 3.68-4.8 3.68-8.64Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.16a7.2 7.2 0 0 1 0-4.04L1.72 7.28a11.28 11.28 0 0 0 0 9.72l3.66-2.84Z"
      />
      <path
        fill="#34A853"
        d="M12 23.28c3.04 0 5.6-1 7.46-2.72l-3.6-2.8c-1 .68-2.28 1.08-3.86 1.08-3.12 0-5.74-2.1-6.62-4.94l-3.66 2.84c1.84 3.9 5.72 6.54 10.28 6.54Z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"lovable" | "google" | null>(null);

  // Already signed in? Straight to the dashboard.
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function signIn(provider: "lovable" | "google") {
    setBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Sign-in didn't complete. Please try again.");
        setBusy(null);
        return;
      }
      if (result.redirected) return; // Browser is heading to the provider.
      // Session was set directly — go to the dashboard.
      await navigate({ to: "/dashboard" });
    } catch {
      toast.error("Sign-in didn't complete. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="font-display text-3xl tracking-tight text-foreground">EduTrace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Student records, verified. Sign in to open your registry.
        </p>
        <div className="mt-8 space-y-3">
          <button
            type="button"
            className="lovable-auth-button w-full"
            disabled={busy !== null}
            onClick={() => void signIn("lovable")}
          >
            {busy === "lovable" ? "Signing in…" : "Continue with Lovable"}
          </button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void signIn("google")}
          >
            <GoogleIcon />
            {busy === "google" ? "Signing in…" : "Continue with Google"}
          </Button>
        </div>
      </div>
    </div>
  );
}
