import { supabaseAdmin } from "@/lib/db/client";

export type ProductOptionValueInput = {
  label: string;
  priceDeltaCents: number;
  order: number;
};

export type ProductOptionInput = {
  name: string;
  required: boolean;
  order: number;
  values: ProductOptionValueInput[];
};

export type ProductAddOnInput = {
  slug: string;
  name: string;
  description?: string;
  priceCents: number;
  addonType: string;
  order: number;
};

export type ProductInput = {
  slug: string;
  name: string;
  subtitle?: string;
  description: string;
  status: "draft" | "active" | "archived";
  priceCents: number;
  currency: string;
  taxIncluded: boolean;
  inTheBox: string[];
  manualUrl?: string;
  rentalEnabled: boolean;
  rentalPriceCents?: number;
  lateFeeCents?: number;
  reserveCutoffDays?: number;
  requiresEventSelection: boolean;
  requiresSailNumber: boolean;
  options: ProductOptionInput[];
  addOns: ProductAddOnInput[];
};

// Row shape returned from Supabase (snake_case → camelCase mapped in helpers)
type ProductRow = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  status: string;
  base_price_cents: number;
  currency: string;
  tax_included: boolean;
  in_the_box: string[];
  manual_url: string | null;
  rental_enabled: boolean;
  rental_price_cents: number | null;
  late_fee_cents: number | null;
  reserve_cutoff_days: number | null;
  requires_event_selection: boolean;
  requires_sail_number: boolean;
  created_at: string;
  updated_at: string;
  product_options: Array<{
    id: string;
    name: string;
    required: boolean;
    sort_order: number;
    product_option_values: Array<{
      id: string;
      label: string;
      price_delta_cents: number;
      sort_order: number;
    }>;
  }>;
  product_addons: Array<{
    sort_order: number;
    addons: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      price_cents: number;
      addon_type: string;
    };
  }>;
};

export type ProductWithRelations = {
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

const WITH_RELATIONS = `
  *,
  product_options (
    id, name, required, sort_order,
    product_option_values ( id, label, price_delta_cents, sort_order )
  ),
  product_addons (
    sort_order,
    addons ( id, slug, name, description, price_cents, addon_type )
  )
` as const;

function toProductWithRelations(row: ProductRow): ProductWithRelations {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description ?? "",
    status: row.status,
    priceCents: row.base_price_cents,
    currency: row.currency,
    taxIncluded: row.tax_included,
    inTheBox: JSON.stringify(row.in_the_box ?? []),
    manualUrl: row.manual_url,
    rentalEnabled: row.rental_enabled,
    rentalPriceCents: row.rental_price_cents,
    lateFeeCents: row.late_fee_cents,
    reserveCutoffDays: row.reserve_cutoff_days,
    requiresEventSelection: row.requires_event_selection,
    requiresSailNumber: row.requires_sail_number,
    options: (row.product_options ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((opt) => ({
        id: opt.id,
        name: opt.name,
        required: opt.required,
        order: opt.sort_order,
        values: (opt.product_option_values ?? [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((v) => ({
            id: v.id,
            label: v.label,
            priceDeltaCents: v.price_delta_cents,
            order: v.sort_order,
          })),
      })),
    addOns: (row.product_addons ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((pa) => ({
        id: pa.addons.id,
        slug: pa.addons.slug,
        name: pa.addons.name,
        description: pa.addons.description,
        priceCents: pa.addons.price_cents,
        addonType: pa.addons.addon_type,
        order: pa.sort_order,
      })),
  };
}

export async function listProducts(): Promise<ProductWithRelations[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(WITH_RELATIONS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listProducts: ${error.message}`);
  return (data as unknown as ProductRow[]).map(toProductWithRelations);
}

export async function getProduct(id: string): Promise<ProductWithRelations | null> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(WITH_RELATIONS)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(`getProduct: ${error.message}`);
  }
  return toProductWithRelations(data as unknown as ProductRow);
}

export async function getActiveProducts(): Promise<ProductWithRelations[]> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select(WITH_RELATIONS)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getActiveProducts: ${error.message}`);
  return (data as unknown as ProductRow[]).map(toProductWithRelations);
}

export async function createProduct(data: ProductInput): Promise<ProductWithRelations> {
  const { options, addOns, inTheBox, priceCents, taxIncluded, ...core } = data;

  const { data: product, error: productError } = await supabaseAdmin
    .from("products")
    .insert({
      slug: core.slug,
      name: core.name,
      subtitle: core.subtitle ?? null,
      description: core.description,
      status: core.status,
      base_price_cents: priceCents,
      currency: core.currency,
      tax_included: taxIncluded,
      in_the_box: inTheBox,
      manual_url: core.manualUrl ?? null,
      rental_enabled: core.rentalEnabled,
      rental_price_cents: core.rentalPriceCents ?? null,
      late_fee_cents: core.lateFeeCents ?? null,
      reserve_cutoff_days: core.reserveCutoffDays ?? null,
      requires_event_selection: core.requiresEventSelection,
      requires_sail_number: core.requiresSailNumber,
    })
    .select("id")
    .single();

  if (productError) throw new Error(`createProduct: ${productError.message}`);
  const productId = (product as { id: string }).id;

  await insertOptions(productId, options);
  await upsertAddOns(productId, addOns);

  const created = await getProduct(productId);
  if (!created) throw new Error("createProduct: product not found after insert");
  return created;
}

export async function updateProduct(id: string, data: ProductInput): Promise<ProductWithRelations> {
  const { options, addOns, inTheBox, priceCents, taxIncluded, ...core } = data;

  const { error: updateError } = await supabaseAdmin
    .from("products")
    .update({
      slug: core.slug,
      name: core.name,
      subtitle: core.subtitle ?? null,
      description: core.description,
      status: core.status,
      base_price_cents: priceCents,
      currency: core.currency,
      tax_included: taxIncluded,
      in_the_box: inTheBox,
      manual_url: core.manualUrl ?? null,
      rental_enabled: core.rentalEnabled,
      rental_price_cents: core.rentalPriceCents ?? null,
      late_fee_cents: core.lateFeeCents ?? null,
      reserve_cutoff_days: core.reserveCutoffDays ?? null,
      requires_event_selection: core.requiresEventSelection,
      requires_sail_number: core.requiresSailNumber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) throw new Error(`updateProduct: ${updateError.message}`);

  // Replace options (delete all, re-insert)
  const { error: deleteOptionsError } = await supabaseAdmin
    .from("product_options")
    .delete()
    .eq("product_id", id);
  if (deleteOptionsError) throw new Error(`updateProduct options delete: ${deleteOptionsError.message}`);

  // Remove existing addon links (addons catalog rows stay)
  const { error: deleteAddOnsError } = await supabaseAdmin
    .from("product_addons")
    .delete()
    .eq("product_id", id);
  if (deleteAddOnsError) throw new Error(`updateProduct addons delete: ${deleteAddOnsError.message}`);

  await insertOptions(id, options);
  await upsertAddOns(id, addOns);

  const updated = await getProduct(id);
  if (!updated) throw new Error("updateProduct: product not found after update");
  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("products").delete().eq("id", id);
  if (error) throw new Error(`deleteProduct: ${error.message}`);
}

// ── Private helpers ────────────────────────────────────────────────────────

async function insertOptions(productId: string, options: ProductOptionInput[]): Promise<void> {
  if (options.length === 0) return;

  const { data: insertedOptions, error: optionsError } = await supabaseAdmin
    .from("product_options")
    .insert(
      options.map((opt) => ({
        product_id: productId,
        name: opt.name,
        required: opt.required,
        sort_order: opt.order,
      })),
    )
    .select("id, sort_order");

  if (optionsError) throw new Error(`insertOptions: ${optionsError.message}`);

  const optionRows = insertedOptions as Array<{ id: string; sort_order: number }>;
  const allValues = optionRows.flatMap((row) => {
    const original = options.find((o) => o.order === row.sort_order);
    if (!original) return [];
    return original.values.map((v) => ({
      option_id: row.id,
      label: v.label,
      price_delta_cents: v.priceDeltaCents,
      sort_order: v.order,
    }));
  });

  if (allValues.length > 0) {
    const { error: valuesError } = await supabaseAdmin
      .from("product_option_values")
      .insert(allValues);
    if (valuesError) throw new Error(`insertOptionValues: ${valuesError.message}`);
  }
}

async function upsertAddOns(productId: string, addOns: ProductAddOnInput[]): Promise<void> {
  if (addOns.length === 0) return;

  for (const addon of addOns) {
    // Upsert into global addons catalog
    const { data: addonRow, error: addonError } = await supabaseAdmin
      .from("addons")
      .upsert(
        {
          slug: addon.slug,
          name: addon.name,
          description: addon.description ?? null,
          addon_type: addon.addonType,
          price_cents: addon.priceCents,
          currency: "usd",
          active: true,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();

    if (addonError) throw new Error(`upsertAddOns catalog: ${addonError.message}`);

    const addonId = (addonRow as { id: string }).id;

    const { error: linkError } = await supabaseAdmin.from("product_addons").insert({
      product_id: productId,
      addon_id: addonId,
      default_selected: false,
      sort_order: addon.order,
    });

    if (linkError) throw new Error(`upsertAddOns link: ${linkError.message}`);
  }
}
