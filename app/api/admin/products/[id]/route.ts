import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getProduct, updateProduct, deleteProduct, type ProductInput } from "@/lib/db/products";

const ADMIN_DOMAIN = "@navomarine.com";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null;
  return session;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as ProductInput;
  const product = await updateProduct(id, body);
  return NextResponse.json({ product });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await deleteProduct(id);
  return NextResponse.json({ success: true });
}
