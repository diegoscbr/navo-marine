import {
  mission,
  stats,
  serviceColumns,
  pastEvents,
  partners,
} from '@/lib/content/about'

describe('about content module', () => {
  it('exposes a mission heading and subline', () => {
    expect(typeof mission.heading).toBe('string')
    expect(mission.heading.length).toBeGreaterThan(0)
    expect(typeof mission.subline).toBe('string')
    expect(mission.subline.length).toBeGreaterThan(0)
  })

  it('exposes exactly four stat tiles with label/value/kicker', () => {
    expect(stats.tiles).toHaveLength(4)
    for (const t of stats.tiles) {
      expect(typeof t.label).toBe('string')
      expect(typeof t.value).toBe('string')
    }
    expect(typeof stats.kicker).toBe('string')
  })

  it('exposes exactly three service columns each with title/body/examples', () => {
    expect(serviceColumns).toHaveLength(3)
    for (const c of serviceColumns) {
      expect(typeof c.title).toBe('string')
      expect(typeof c.body).toBe('string')
      expect(Array.isArray(c.examples)).toBe(true)
      expect(c.examples.length).toBeGreaterThan(0)
    }
  })

  it('exposes past-event entries with name, date_label, location, and image path', () => {
    expect(pastEvents.length).toBeGreaterThanOrEqual(6)
    for (const e of pastEvents) {
      expect(typeof e.name).toBe('string')
      expect(typeof e.date_label).toBe('string')
      expect(typeof e.location).toBe('string')
      expect(e.image).toMatch(/^\/events\//)
    }
  })

  it('exposes partner entries with name, logo path, and optional premier flag', () => {
    expect(partners.length).toBeGreaterThanOrEqual(3)
    const premier = partners.filter((p) => p.premier)
    expect(premier.length).toBe(1)
    expect(premier[0].name).toMatch(/Vakaros/i)
  })
})
