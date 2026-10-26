import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { auditLogsQueryOptions, listAuditLogs } from "@/lib/edutrace.functions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — EduTrace" },
      { name: "description", content: "Full audit trail of all data changes and access in EduTrace." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(auditLogsQueryOptions),
  component: AuditPage,
});

const ACTION_COLOR: Record<string, string> = {
  insert: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  verify: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  upload: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function AuditPage() {
  const { data: logs } = useSuspenseQuery(auditLogsQueryOptions);
  const [search, setSearch] = useState("");

  const filtered = logs.filter((l) =>
    [l.action, l.entity_type, l.entity_id, JSON.stringify(l.details)]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete trail of all data operations — last {logs.length} entries.
        </p>
      </div>

      <Input
        id="audit-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by action, entity type or ID…"
        className="max-w-md"
      />

      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-4xl">📋</p>
          <p className="mt-4 text-sm text-muted-foreground">No audit entries yet. Actions will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("en-IN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge className={ACTION_COLOR[log.action] ?? "bg-muted text-muted-foreground"}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm capitalize">{log.entity_type.replace(/_/g, " ")}</TableCell>
                  <TableCell className="max-w-32 truncate font-mono text-xs text-muted-foreground">
                    {log.entity_id ? log.entity_id.slice(0, 8) + "…" : "—"}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No entries match "{search}".
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        All times in your local timezone. Logs are retained per DPDP 2023 data governance policy.
      </p>
    </div>
  );
}
