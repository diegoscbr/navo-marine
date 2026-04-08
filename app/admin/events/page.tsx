import type { Metadata } from 'next'
import { supabaseAdmin } from '@/lib/db/client'
import { AddEventForm } from './AddEventForm'
import { DeleteEventButton } from './DeleteEventButton'

export const metadata: Metadata = {
  title: 'Events | NAVO Admin',
}

type RentalEvent = {
  id: string
  name: string
  location: string
  event_url: string | null
  start_date: string
  end_date: string
  active: boolean
  created_at: string
}

export default async function AdminEventsPage() {
  const { data, error } = await supabaseAdmin
    .from('rental_events')
    .select('id, name, location, event_url, start_date, end_date, active, created_at')
    .order('start_date', { ascending: false })

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-red-400">Failed to load events: {error.message}</p>
      </div>
    )
  }

  const events = (data ?? []) as RentalEvent[]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-white">Events</h1>
          <p className="mt-1 text-sm text-white/40">
            {events.length} event{events.length !== 1 ? 's' : ''} — these populate the &quot;Rent for an Event&quot; dropdown on /reserve
          </p>
        </div>
        <AddEventForm />
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-16 text-center">
          <p className="text-sm text-white/40">No events yet. Add one above.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Event</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {events.map((evt) => (
                <tr key={evt.id} className="bg-white/[0.02] transition-colors hover:bg-white/5">
                  <td className="px-5 py-3">
                    <p className="font-medium text-white">{evt.name}</p>
                    {evt.event_url && (
                      <a
                        href={evt.event_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-marine-400 hover:underline"
                      >
                        Event site ↗
                      </a>
                    )}
                  </td>
                  <td className="px-5 py-3 text-white/60">{evt.location}</td>
                  <td className="px-5 py-3 text-white/50 text-xs">
                    {evt.start_date} → {evt.end_date}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        evt.active
                          ? 'bg-green-500/15 text-green-400 border-green-500/30'
                          : 'bg-white/10 text-white/40 border-white/10'
                      }`}
                    >
                      {evt.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <DeleteEventButton eventId={evt.id} eventName={evt.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
