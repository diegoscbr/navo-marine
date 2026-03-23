function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type BookingParams = {
  to: string
  reservationId: string
  productName: string
  startDate: string | null
  endDate: string | null
  totalCents: number
}

type BookingConfirmedParams = BookingParams & { orderId: string }

type EmailResult = { to: string; subject: string; html: string }

export function bookingPending(params: BookingParams): EmailResult {
  const { to, reservationId, productName, startDate, endDate, totalCents } = params
  const dateRange =
    startDate && endDate ? `${startDate} – ${endDate}` : 'See event details'

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0B1F2A;color:#fff;padding:40px 20px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#0F2C3F;border-radius:12px;padding:40px;border:1px solid rgba(255,255,255,0.1)">
    <img src="https://navomarine.com/logos/transparent_background_logo.png" alt="NAVO Marine" width="120" style="margin-bottom:32px" />
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px">Booking Received</h1>
    <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 32px">Your booking is being processed. We'll send a final confirmation once payment is verified.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Product</td>
        <td style="padding:10px 0;text-align:right">${productName}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Dates</td>
        <td style="padding:10px 0;text-align:right">${dateRange}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Total</td>
        <td style="padding:10px 0;text-align:right;font-weight:600">${formatUSD(totalCents)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Reservation ID</td>
        <td style="padding:10px 0;text-align:right;font-size:12px;color:rgba(255,255,255,0.4)">${reservationId}</td>
      </tr>
    </table>

    <p style="margin-top:32px;font-size:13px;color:rgba(255,255,255,0.4)">
      Questions? Reply to this email or call us at <a href="tel:6192889746" style="color:#1E6EFF">619-288-9746</a>.
    </p>
  </div>
</body>
</html>`

  return {
    to,
    subject: `Your NAVO booking is processing — ${productName}`,
    html,
  }
}

export function bookingConfirmed(params: BookingConfirmedParams): EmailResult {
  const { to, reservationId, productName, startDate, endDate, totalCents, orderId } = params
  const dateRange =
    startDate && endDate ? `${startDate} – ${endDate}` : 'See event details'

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0B1F2A;color:#fff;padding:40px 20px;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#0F2C3F;border-radius:12px;padding:40px;border:1px solid rgba(255,255,255,0.1)">
    <img src="https://navomarine.com/logos/transparent_background_logo.png" alt="NAVO Marine" width="120" style="margin-bottom:32px" />
    <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(30,110,255,0.15);border:1px solid rgba(30,110,255,0.3);border-radius:20px;padding:4px 14px;margin-bottom:24px">
      <span style="color:#1E6EFF;font-size:13px;font-weight:600">✓ Confirmed</span>
    </div>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 8px">Booking Confirmed</h1>
    <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 32px">Payment received. Your unit will be ready for the event.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Product</td>
        <td style="padding:10px 0;text-align:right">${productName}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Dates</td>
        <td style="padding:10px 0;text-align:right">${dateRange}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Total Paid</td>
        <td style="padding:10px 0;text-align:right;font-weight:600">${formatUSD(totalCents)}</td>
      </tr>
      <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Order ID</td>
        <td style="padding:10px 0;text-align:right;font-size:12px;color:rgba(255,255,255,0.4)">${orderId}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:rgba(255,255,255,0.4)">Reservation ID</td>
        <td style="padding:10px 0;text-align:right;font-size:12px;color:rgba(255,255,255,0.4)">${reservationId}</td>
      </tr>
    </table>

    <p style="margin-top:32px;font-size:13px;color:rgba(255,255,255,0.4)">
      Questions? Reply to this email or call us at <a href="tel:6192889746" style="color:#1E6EFF">619-288-9746</a>.
    </p>
  </div>
</body>
</html>`

  return {
    to,
    subject: `Booking confirmed — ${productName}`,
    html,
  }
}
