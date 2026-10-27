import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getDemoStudents } from "@/lib/demo.functions";
import { detectDuplicates } from "@/lib/duplicate-detection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/demo/duplicates")({
  ssr: false,
  head: () => ({ meta: [{ title: "Duplicate Review — EduTrace Demo" }] }),
  component: DemoDuplicates,
});

type Resolution = "merge" | "keep_both" | "delete_first" | "delete_second";

function DemoDuplicates() {
  const { data: students = [] } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });
  const [resolutions, setResolutions] = useState<Record<string, { resolution: Resolution; notes: string; resolved: boolean }>>({});

  const inMemoryDups = detectDuplicates(students as any);

  function handleResolve(dupKey: string) {
    const r = resolutions[dupKey];
    if (!r?.resolution) { toast.error("Select a resolution before marking as resolved."); return; }
    setResolutions((prev) => ({ ...prev, [dupKey]: { ...r, resolved: true } }));
    toast.success("Duplicate case marked as resolved (demo).");
  }

  if (inMemoryDups.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl tracking-tight text-foreground">Duplicate Review <span className="text-sm font-normal text-amber-600">(Demo)</span></h1>
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-4 font-display text-xl text-foreground">No duplicates detected</p>
          <p className="mt-2 text-sm text-muted-foreground">The demo sandbox has no duplicate student records. Import more students with matching APAAR IDs or names/DOB to see this page in action.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">Duplicate Review <span className="text-sm font-normal text-amber-600">(Demo)</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">{inMemoryDups.length} potential duplicate pair{inMemoryDups.length !== 1 ? "s" : ""} found in the demo registry.</p>
      </div>

      <div className="space-y-4">
        {inMemoryDups.map((dup, idx) => {
          const key = `${dup.studentAId}-${dup.studentBId}`;
          const r = resolutions[key] ?? { resolution: "", notes: "", resolved: false };
          return (
            <div key={key} className={cn("rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm", r.resolved && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-red-100 text-red-800">Duplicate #{idx + 1}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{(dup as any).reason?.replace(/_/g, " ") ?? "name + DOB match"}</Badge>
                    {r.resolved && <Badge className="bg-green-100 text-green-800">Resolved</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 text-sm">
                    <div className="rounded-lg border border-border p-3">
                      <p className="font-semibold text-foreground">{(dup as any).studentA?.name ?? "Student A"}</p>
                      <p className="text-xs text-muted-foreground">ID: {(dup as any).studentA?.student_id ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">APAAR: {(dup as any).studentA?.apaar_id || "—"}</p>
                      <p className="text-xs text-muted-foreground">DOB: {(dup as any).studentA?.dob ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="font-semibold text-foreground">{(dup as any).studentB?.name ?? "Student B"}</p>
                      <p className="text-xs text-muted-foreground">ID: {(dup as any).studentB?.student_id ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">APAAR: {(dup as any).studentB?.apaar_id || "—"}</p>
                      <p className="text-xs text-muted-foreground">DOB: {(dup as any).studentB?.dob ?? "—"}</p>
                    </div>
                  </div>
                </div>

                {!r.resolved && (
                  <div className="flex flex-col gap-3 min-w-48">
                    <Select value={r.resolution} onValueChange={(v) => setResolutions((prev) => ({ ...prev, [key]: { ...r, resolution: v as Resolution } }))}>
                      <SelectTrigger id={`demo-dup-resolution-${idx}`} className="w-full">
                        <SelectValue placeholder="Choose resolution…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merge">Merge records</SelectItem>
                        <SelectItem value="keep_both">Keep both</SelectItem>
                        <SelectItem value="delete_first">Delete first</SelectItem>
                        <SelectItem value="delete_second">Delete second</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Notes (optional)"
                      value={r.notes}
                      onChange={(e) => setResolutions((prev) => ({ ...prev, [key]: { ...r, notes: e.target.value } }))}
                      rows={2}
                    />
                    <Button id={`demo-dup-resolve-${idx}`} size="sm" onClick={() => handleResolve(key)}>Mark resolved</Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
