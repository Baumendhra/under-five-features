import { createFileRoute, redirect } from "@tanstack/react-router";

/** /demo → redirect to /demo/dashboard */
export const Route = createFileRoute("/demo/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/demo/dashboard" });
  },
});
