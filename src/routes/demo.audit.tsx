import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/demo/audit")({
  ssr: false,
  head: () => ({ meta: [{ title: "Audit Log — EduTrace Demo" }] }),
  component: DemoAudit,
});

// Static demo audit log entries
const DEMO_LOGS = [
  { id: "log-1", action: "insert", entity_type: "student", entity_id: "demo-1", details: { name: "Anita Sharma", apaar_id: "123456789012" }, created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
  { id: "log-2", action: "insert", entity_type: "student", entity_id: "demo-2", details: { name: "Ravi Kumar", apaar_id: "" }, created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
  { id: "log-3", action: "insert", entity_type: "student", entity_id: "demo-3", details: { name: "Sita Devi", apaar_id: "111111111111" }, created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
  { id: "log-4", action: "verify", entity_type: "student", entity_id: "demo-1", details: { apaar_id: "123456789012", result: "verified" }, created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() },
  { id: "log-5", action: "upload", entity_type: "student_batch", entity_id: null, details: { rows_imported: 3, source: "demo_csv" }, created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  { id: "log-6", action: "update", entity_type: "institution", entity_id: "demo-inst", details: { field: "contact_email", from: null, to: "admin@nitk.ac.in" }, created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
];

const ACTION_COLOR: Record<string, string> = {
  insert: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  verify: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  upload: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

function DemoAudit() {
  const [search, setSearch] = useState("");

  const filtered = DEMO_LOGS.filter((l) =>
    [l.action, l.entity_type, l.entity_id, JSON.stringify(l.details)]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">Audit Log <span className="text-sm font-normal text-amber-600">(Demo)</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">Complete trail of all data operations — {DEMO_LOGS.length} demo entries.</p>
      </div>

      <Input
        id="demo-audit-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by action, entity type or ID…"
        className="max-w-md"
      />

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
                  {new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                </TableCell>
                <TableCell>
                  <Badge className={ACTION_COLOR[log.action] ?? "bg-muted text-muted-foreground"}>{log.action}</Badge>
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
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No entries match "{search}".</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">All times in your local timezone. Demo logs are static — real logs persist to the Supabase audit table.</p>
    </div>
  );
}
