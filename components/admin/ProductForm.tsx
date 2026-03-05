"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProductInput, ProductOptionInput, ProductAddOnInput } from "@/lib/db/products";

type ProductWithRelations = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string;
  status: string;
  priceCents: number;
  currency: string;
  taxIncluded: boolean;
  inTheBox: string;
  manualUrl: string | null;
  rentalEnabled: boolean;
  rentalPriceCents: number | null;
  lateFeeCents: number | null;
  reserveCutoffDays: number | null;
  requiresEventSelection: boolean;
  requiresSailNumber: boolean;
  options: Array<{
    id: string;
    name: string;
    required: boolean;
    order: number;
    values: Array<{ id: string; label: string; priceDeltaCents: number; order: number }>;
  }>;
  addOns: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    priceCents: number;
    addonType: string;
    order: number;
  }>;
};

interface Props {
  initialData?: ProductWithRelations;
}

type OptionState = { name: string; required: boolean; values: { label: string; priceDeltaCents: number }[] };
type AddOnState = { slug: string; name: string; description: string; priceCents: number; addonType: string };

function fieldClass(extra = "") {
  return `w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-marine-500 focus:outline-none focus:ring-1 focus:ring-marine-500 ${extra}`;
}

function labelClass() {
  return "mb-1 block text-xs font-medium uppercase tracking-wider text-white/40";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 border-b border-white/10 pb-2 text-sm font-semibold text-white/60">{children}</h2>
  );
}

export default function ProductForm({ initialData }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Core fields
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [subtitle, setSubtitle] = useState(initialData?.subtitle ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [status, setStatus] = useState<"draft" | "active" | "archived">(
    (initialData?.status as "draft" | "active" | "archived") ?? "draft",
  );
  const [priceCents, setPriceCents] = useState(
    initialData ? String(initialData.priceCents / 100) : "",
  );
  const [inTheBox, setInTheBox] = useState(
    initialData ? (JSON.parse(initialData.inTheBox) as string[]).join("\n") : "",
  );
  const [manualUrl, setManualUrl] = useState(initialData?.manualUrl ?? "");

  // Rental
  const [rentalEnabled, setRentalEnabled] = useState(initialData?.rentalEnabled ?? false);
  const [rentalPrice, setRentalPrice] = useState(
    initialData?.rentalPriceCents ? String(initialData.rentalPriceCents / 100) : "",
  );
  const [lateFee, setLateFee] = useState(
    initialData?.lateFeeCents ? String(initialData.lateFeeCents / 100) : "",
  );
  const [cutoffDays, setCutoffDays] = useState(
    initialData?.reserveCutoffDays ? String(initialData.reserveCutoffDays) : "",
  );
  const [requiresEvent, setRequiresEvent] = useState(initialData?.requiresEventSelection ?? false);
  const [requiresSail, setRequiresSail] = useState(initialData?.requiresSailNumber ?? false);

  // Options
  const [options, setOptions] = useState<OptionState[]>(
    initialData?.options.map((o) => ({
      name: o.name,
      required: o.required,
      values: o.values.map((v) => ({ label: v.label, priceDeltaCents: v.priceDeltaCents })),
    })) ?? [],
  );

  // Add-ons
  const [addOns, setAddOns] = useState<AddOnState[]>(
    initialData?.addOns.map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description ?? "",
      priceCents: a.priceCents,
      addonType: a.addonType,
    })) ?? [],
  );

  // Auto-slug from name
  function handleNameChange(val: string) {
    setName(val);
    if (!initialData) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
    }
  }

  // Options helpers
  function addOption() {
    setOptions((prev) => [...prev, { name: "", required: false, values: [] }]);
  }
  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateOption(i: number, patch: Partial<OptionState>) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function addValue(optIdx: number) {
    setOptions((prev) =>
      prev.map((o, idx) =>
        idx === optIdx ? { ...o, values: [...o.values, { label: "", priceDeltaCents: 0 }] } : o,
      ),
    );
  }
  function removeValue(optIdx: number, valIdx: number) {
    setOptions((prev) =>
      prev.map((o, idx) =>
        idx === optIdx ? { ...o, values: o.values.filter((_, vi) => vi !== valIdx) } : o,
      ),
    );
  }
  function updateValue(optIdx: number, valIdx: number, patch: Partial<{ label: string; priceDeltaCents: number }>) {
    setOptions((prev) =>
      prev.map((o, idx) =>
        idx === optIdx
          ? { ...o, values: o.values.map((v, vi) => (vi === valIdx ? { ...v, ...patch } : v)) }
          : o,
      ),
    );
  }

  // Add-ons helpers
  function addAddOn() {
    setAddOns((prev) => [...prev, { slug: "", name: "", description: "", priceCents: 0, addonType: "accessory" }]);
  }
  function removeAddOn(i: number) {
    setAddOns((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateAddOn(i: number, patch: Partial<AddOnState>) {
    setAddOns((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const payload: ProductInput = {
      slug,
      name,
      subtitle: subtitle || undefined,
      description,
      status,
      priceCents: Math.round(parseFloat(priceCents) * 100),
      currency: "usd",
      taxIncluded: true,
      inTheBox: inTheBox.split("\n").map((s) => s.trim()).filter(Boolean),
      manualUrl: manualUrl || undefined,
      rentalEnabled,
      rentalPriceCents: rentalEnabled && rentalPrice ? Math.round(parseFloat(rentalPrice) * 100) : undefined,
      lateFeeCents: rentalEnabled && lateFee ? Math.round(parseFloat(lateFee) * 100) : undefined,
      reserveCutoffDays: rentalEnabled && cutoffDays ? parseInt(cutoffDays, 10) : undefined,
      requiresEventSelection: rentalEnabled ? requiresEvent : false,
      requiresSailNumber: rentalEnabled ? requiresSail : false,
      options: options.map((o, i) => ({
        name: o.name,
        required: o.required,
        order: i,
        values: o.values.map((v, vi) => ({ label: v.label, priceDeltaCents: v.priceDeltaCents, order: vi })),
      })),
      addOns: addOns.map((a, i) => ({
        slug: a.slug || a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: a.name,
        description: a.description || undefined,
        priceCents: a.priceCents,
        addonType: a.addonType,
        order: i,
      })),
    };

    startTransition(async () => {
      try {
        const url = initialData
          ? `/api/admin/products/${initialData.id}`
          : "/api/admin/products";
        const method = initialData ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError((data as { error?: string }).error ?? "Something went wrong.");
          return;
        }

        router.push("/admin/products");
        router.refresh();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-10">
      {/* ── Basic Info ── */}
      <section>
        <SectionTitle>Basic info</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass()}>Product name *</label>
            <input
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={fieldClass()}
              placeholder="e.g. Vakaros Atlas 2"
            />
          </div>

          <div>
            <label className={labelClass()}>Slug *</label>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={fieldClass()}
              placeholder="e.g. atlas-2"
            />
          </div>

          <div>
            <label className={labelClass()}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className={fieldClass()}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className={labelClass()}>Subtitle</label>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={fieldClass()}
              placeholder="Short one-liner shown under the name"
            />
          </div>

          <div className="col-span-2">
            <label className={labelClass()}>Description *</label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={fieldClass()}
              placeholder="Short product description for the storefront"
            />
          </div>

          <div>
            <label className={labelClass()}>Price (USD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-white/40">$</span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={priceCents}
                onChange={(e) => setPriceCents(e.target.value)}
                className={fieldClass("pl-7")}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className={labelClass()}>Manual URL</label>
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              className={fieldClass()}
              placeholder="https://support.example.com/"
            />
          </div>

          <div className="col-span-2">
            <label className={labelClass()}>In the box (one item per line)</label>
            <textarea
              rows={3}
              value={inTheBox}
              onChange={(e) => setInTheBox(e.target.value)}
              className={fieldClass()}
              placeholder={"Atlas 2\nMount\nCarrying case"}
            />
          </div>
        </div>
      </section>

      {/* ── Rental Config ── */}
      <section>
        <SectionTitle>Rental</SectionTitle>
        <label className="mb-4 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={rentalEnabled}
            onChange={(e) => setRentalEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/10 text-marine-500 focus:ring-marine-500"
          />
          <span className="text-sm text-white/70">Enable rental option for this product</span>
        </label>

        {rentalEnabled && (
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div>
              <label className={labelClass()}>Rental price / day</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-white/40">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rentalPrice}
                  onChange={(e) => setRentalPrice(e.target.value)}
                  className={fieldClass("pl-7")}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className={labelClass()}>Late fee</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-white/40">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lateFee}
                  onChange={(e) => setLateFee(e.target.value)}
                  className={fieldClass("pl-7")}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className={labelClass()}>Cutoff (days in advance)</label>
              <input
                type="number"
                min="0"
                value={cutoffDays}
                onChange={(e) => setCutoffDays(e.target.value)}
                className={fieldClass()}
                placeholder="14"
              />
            </div>
            <div className="col-span-3 flex gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/60">
                <input
                  type="checkbox"
                  checked={requiresEvent}
                  onChange={(e) => setRequiresEvent(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/10"
                />
                Requires event selection
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-white/60">
                <input
                  type="checkbox"
                  checked={requiresSail}
                  onChange={(e) => setRequiresSail(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/10"
                />
                Requires sail number
              </label>
            </div>
          </div>
        )}
      </section>

      {/* ── Product Options (feed) ── */}
      <section>
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
          <h2 className="text-sm font-semibold text-white/60">Product options</h2>
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add option
          </button>
        </div>

        {options.length === 0 && (
          <p className="text-xs text-white/30">
            Options let customers choose variants (e.g. Color, Bundle). They appear in the product feed.
          </p>
        )}

        <div className="space-y-4">
          {options.map((opt, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center gap-3">
                <input
                  value={opt.name}
                  onChange={(e) => updateOption(i, { name: e.target.value })}
                  className={fieldClass("flex-1")}
                  placeholder="Option name (e.g. Color, Bundle)"
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-white/50">
                  <input
                    type="checkbox"
                    checked={opt.required}
                    onChange={(e) => updateOption(i, { required: e.target.checked })}
                    className="h-3.5 w-3.5 rounded"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-xs text-red-400/60 hover:text-red-400"
                >
                  Remove
                </button>
              </div>

              {/* Values */}
              <div className="space-y-2 pl-3">
                {opt.values.map((v, vi) => (
                  <div key={vi} className="flex items-center gap-2">
                    <input
                      value={v.label}
                      onChange={(e) => updateValue(i, vi, { label: e.target.value })}
                      className={fieldClass("flex-1")}
                      placeholder="Value label (e.g. Black)"
                    />
                    <div className="relative w-36 shrink-0">
                      <span className="absolute left-3 top-2 text-xs text-white/30">+$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={v.priceDeltaCents / 100}
                        onChange={(e) =>
                          updateValue(i, vi, { priceDeltaCents: Math.round(parseFloat(e.target.value || "0") * 100) })
                        }
                        className={fieldClass("pl-8")}
                        placeholder="0.00"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeValue(i, vi)}
                      className="text-xs text-red-400/50 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addValue(i)}
                  className="mt-1 text-xs text-marine-400/60 hover:text-marine-400"
                >
                  + Add value
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Add-ons ── */}
      <section>
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-2">
          <h2 className="text-sm font-semibold text-white/60">Add-ons</h2>
          <button
            type="button"
            onClick={addAddOn}
            className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add add-on
          </button>
        </div>

        {addOns.length === 0 && (
          <p className="text-xs text-white/30">
            Add-ons are optional extras customers can purchase alongside the product (e.g. Warranty, Accessories).
          </p>
        )}

        <div className="space-y-3">
          {addOns.map((a, i) => (
            <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass()}>Name</label>
                  <input
                    value={a.name}
                    onChange={(e) => updateAddOn(i, { name: e.target.value })}
                    className={fieldClass()}
                    placeholder="e.g. Vakaros Care Warranty"
                  />
                </div>
                <div>
                  <label className={labelClass()}>Type</label>
                  <select
                    value={a.addonType}
                    onChange={(e) => updateAddOn(i, { addonType: e.target.value })}
                    className={fieldClass()}
                  >
                    <option value="warranty">Warranty</option>
                    <option value="accessory">Accessory</option>
                    <option value="service">Service</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass()}>Price (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm text-white/40">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={a.priceCents / 100}
                      onChange={(e) =>
                        updateAddOn(i, { priceCents: Math.round(parseFloat(e.target.value || "0") * 100) })
                      }
                      className={fieldClass("pl-7")}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass()}>Slug (auto if blank)</label>
                  <input
                    value={a.slug}
                    onChange={(e) => updateAddOn(i, { slug: e.target.value })}
                    className={fieldClass()}
                    placeholder="vakaros-care-warranty"
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass()}>Description</label>
                  <textarea
                    rows={2}
                    value={a.description}
                    onChange={(e) => updateAddOn(i, { description: e.target.value })}
                    className={fieldClass()}
                    placeholder="Optional description"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAddOn(i)}
                className="text-xs text-red-400/60 hover:text-red-400"
              >
                Remove add-on
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Submit ── */}
      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-4 border-t border-white/10 pt-6">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-marine-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-marine-400 disabled:opacity-50"
        >
          {isPending ? "Saving…" : initialData ? "Save changes" : "Create product"}
        </button>
        <a href="/admin/products" className="text-sm text-white/40 hover:text-white/70">
          Cancel
        </a>
      </div>
    </form>
  );
}
