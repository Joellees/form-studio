import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Log = { id: string; field_type: string; value: unknown; notes: string | null; logged_at: string };

export function LogList({ logs }: { logs: Log[] }) {
  if (logs.length === 0) {
    return <p className="px-6 py-4 text-sm text-[color:var(--color-ink)]/70">No entries yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>when</TableHead>
          <TableHead>field</TableHead>
          <TableHead>value</TableHead>
          <TableHead>notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="tabular-nums text-[color:var(--color-ink)]/70">
              {new Date(l.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </TableCell>
            <TableCell>{l.field_type.replace("_", " ")}</TableCell>
            <TableCell className="tabular-nums">{formatValue(l.value)}</TableCell>
            <TableCell className="text-[color:var(--color-ink)]/70">{l.notes ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatValue(v: unknown): string {
  if (!v || typeof v !== "object") return String(v ?? "—");
  const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val !== null && val !== "");
  if (entries.length === 0) return "—";
  return entries.map(([k, val]) => `${k.replace(/_cm$/, "")}: ${val}`).join(" · ");
}
