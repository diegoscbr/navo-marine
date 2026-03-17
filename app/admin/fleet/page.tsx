import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Fleet | NAVO Admin",
};

const STATUS_STYLES: Record<string, string> = {
  available:       "bg-emerald-500/15 text-emerald-400",
  reserved_unpaid: "bg-yellow-500/15 text-yellow-400",
  reserved_paid:   "bg-blue-500/15 text-blue-400",
  in_transit:      "bg-purple-500/15 text-purple-400",
  at_event:        "bg-cyan-500/15 text-cyan-400",
  returned:        "bg-white/10 text-white/50",
  damaged:         "bg-red-500/15 text-red-400",
  lost:            "bg-red-500/20 text-red-500",
  sold:            "bg-white/5 text-white/30",
};

type UnitRow = {
  id: string;
  navo_number: string;
  serial_number: string | null;
  status: string;
  notes: string | null;
  added_at: string;
  products: { name: string; slug: string } | null;
};

export default async function AdminFleetPage() {
  const { data, error } = await supabaseAdmin
    .from("units")
    .select("id, navo_number, serial_number, status, notes, added_at, products(name, slug)")
    .order("navo_number");

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-red-400">Failed to load fleet: {error.message}</p>
      </div>
    );
  }

  const units = data as unknown as UnitRow[];

  const statusCounts = units.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-semibold text-white">Fleet</h1>
        <p className="mt-1 text-sm text-white/40">{units.length} unit{units.length !== 1 ? "s" : ""} total</p>
      </div>

      {/* Status summary */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([status, count]) => (
          <span
            key={status}
            className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-white/10 text-white/50"}`}
          >
            {status.replace(/_/g, " ")} · {count}
          </span>
        ))}
      </div>

      {/* Table */}
      {units.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-16 text-center">
          <p className="text-sm text-white/40">No units in fleet yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Serial</th>
                <th className="px-5 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {units.map((u) => (
                <tr key={u.id} className="bg-white/[0.02] hover:bg-white/5">
                  <td className="px-5 py-3 font-mono text-white">{u.navo_number}</td>
                  <td className="px-5 py-3 text-white/60">{u.products?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[u.status] ?? "bg-white/10 text-white/50"}`}>
                      {u.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-white/40">{u.serial_number ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-white/40">{u.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
