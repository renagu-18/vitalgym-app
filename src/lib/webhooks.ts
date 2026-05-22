export interface BookingWebhookPayload {
  event: 'booking_approved' | 'booking_rejected' | 'booking_reminder'
  client_name: string
  client_email: string
  client_phone: string | null
  notify_via: 'whatsapp' | 'gmail'
  booking_date: string
  booking_time: string
  rejection_reason?: string
}

export async function sendBookingWebhook(payload: BookingWebhookPayload) {
  const base = process.env.N8N_WEBHOOK_BASE_URL
  if (!base || base === 'your-n8n-webhook-base-url') {
    console.log('[Webhook no configurado]', payload)
    return
  }

  try {
    await fetch(`${base}/${payload.event}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[Webhook error]', err)
  }
}

export function formatBlockTime(startIso: string, endIso: string) {
  const tz = 'America/Santiago'
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone: tz, hour12: false }
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }
  return {
    date: new Date(startIso).toLocaleDateString('es-CL', dateOpts),
    time: `${new Date(startIso).toLocaleTimeString('es-CL', opts)} – ${new Date(endIso).toLocaleTimeString('es-CL', opts)}`,
  }
}
