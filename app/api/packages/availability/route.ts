import { NextRequest, NextResponse } from 'next/server'
import { checkPackageAvailability } from '@/lib/db/packages'
import { supabaseAdmin } from '@/lib/db/client'
import { isValidDate } from '@/lib/utils/dates'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const productId = searchParams.get('product_id')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  if (!productId || !startDate || !endDate) {
    return NextResponse.json({ error: 'product_id, start_date, end_date are required' }, { status: 400 })
  }

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return NextResponse.json(
      { error: 'start_date and end_date must be valid YYYY-MM-DD dates' },
      { status: 400 },
    )
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('capacity')
    .eq('id', productId)
    .single()

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  try {
    const result = await checkPackageAvailability(
      productId,
      startDate,
      endDate,
      (product as { capacity: number }).capacity,
    )
    return NextResponse.json({ available: result.available, remaining: result.remaining })
  } catch (err) {
    console.error('[api/packages/availability] error:', err)
    return NextResponse.json({ error: 'Availability check failed' }, { status: 503 })
  }
}
