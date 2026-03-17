import { NextResponse } from "next/server";
import { getActiveProducts } from "@/lib/db/products";

export async function GET() {
  const products = await getActiveProducts();

  const feed = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    subtitle: p.subtitle ?? null,
    description: p.description,
    status: p.status,
    pricing: {
      amountCents: p.priceCents,
      currency: p.currency,
      taxIncluded: p.taxIncluded,
    },
    inTheBox: JSON.parse(p.inTheBox) as string[],
    options: p.options.map((opt) => ({
      name: opt.name,
      required: opt.required,
      values: opt.values.map((v) => ({
        label: v.label,
        priceDeltaCents: v.priceDeltaCents,
      })),
    })),
    addOns: p.addOns.map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description ?? null,
      priceCents: a.priceCents,
      addonType: a.addonType,
    })),
    rentalPolicy: p.rentalEnabled
      ? {
          rentalPriceCents: p.rentalPriceCents,
          lateFeeCents: p.lateFeeCents,
          reserveCutoffDays: p.reserveCutoffDays,
          requiresEventSelection: p.requiresEventSelection,
          requiresSailNumber: p.requiresSailNumber,
        }
      : null,
    support: p.manualUrl ? { manualUrl: p.manualUrl } : null,
  }));

  return NextResponse.json({ products: feed });
}
