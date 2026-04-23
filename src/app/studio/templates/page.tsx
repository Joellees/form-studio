import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: templates } = await supabase
    .from("session_templates")
    .select("id, name, day_label, description, created_at, archived")
    .eq("archived", false)
    .order("created_at", { ascending: false });

  return (
    <div className="rise-in-stagger space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.26em] text-[color:var(--color-moss)]">templates</p>
          <h1 className="mt-2 font-display text-4xl">Sessions, ready to deploy.</h1>
        </div>
        <Button asChild>
          <Link href="/studio/templates/new">new template</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {!templates || templates.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No templates yet"
                body="Build once, deploy often. Templates become the starting point for any session you schedule."
                action={
                  <Button asChild>
                    <Link href="/studio/templates/new">build your first template</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>name</TableHead>
                  <TableHead>day</TableHead>
                  <TableHead>description</TableHead>
                  <TableHead className="text-right">created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link href={`/studio/templates/${t.id}`} className="hover:text-[color:var(--color-moss-deep)]">
                        {t.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[color:var(--color-ink)]/70">{t.day_label ?? "—"}</TableCell>
                    <TableCell className="max-w-md truncate text-[color:var(--color-ink)]/70">
                      {t.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-[color:var(--color-ink)]/70">
                      {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
