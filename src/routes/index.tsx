import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EduTrace — Student Record Verification" },
      {
        name: "description",
        content:
          "Import student records from a CSV, check APAAR IDs, catch duplicates before they enter your registry, and track everything from one dashboard.",
      },
      { property: "og:title", content: "EduTrace — Student Record Verification" },
      {
        property: "og:description",
        content:
          "Import student records from a CSV, check APAAR IDs, catch duplicates before they enter your registry, and track everything from one dashboard.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  const features = [
    {
      title: "Import from a spreadsheet",
      body: "Upload a CSV of your student list — we read the columns, you review before anything is saved.",
    },
    {
      title: "APAAR ID checks",
      body: "Every 12-digit APAAR ID is validated on the way in, and missing ones are flagged for follow-up.",
    },
    {
      title: "Duplicate detection",
      body: "Repeated APAAR IDs and same name-plus-date-of-birth pairs are caught before they enter the registry.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="font-display text-2xl tracking-tight text-foreground">EduTrace</span>
        <Button asChild>
          <Link to={signedIn ? "/dashboard" : "/auth"}>
            {signedIn ? "Open EduTrace" : "Sign in"}
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20">
        <section className="border-b border-border py-16 text-center sm:py-24">
          <h1 className="font-display text-5xl leading-tight tracking-tight text-foreground sm:text-6xl">
            Student records, verified.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Bring your student list in as a CSV. EduTrace checks each APAAR ID, catches duplicate
            entries, and keeps one clean registry your office can trust.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/dashboard" : "/auth"}>
                {signedIn ? "Open dashboard" : "Sign in to get started"}
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-6 py-14 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-display text-xl text-foreground">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-border bg-secondary p-6 text-center">
          <p className="text-sm text-secondary-foreground">
            New here?{" "}
            <a
              href="/sample/student-upload-sample.csv"
              download
              className="font-medium underline underline-offset-4"
            >
              Download the sample CSV
            </a>{" "}
            to see the format EduTrace expects.
          </p>
        </section>
      </main>
    </div>
  );
}
