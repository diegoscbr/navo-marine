export const mission = {
  heading: 'We power competitive sailing.',
  subline:
    'Premier Vakaros partner. Race-management technology and hardware access for the regattas that matter — youth, amateur, professional, across three continents.',
} as const

export type StatTile = {
  label: string
  value: string
}

export const stats: { tiles: StatTile[]; kicker: string } = {
  tiles: [
    { label: 'Regattas served', value: '42+' },
    { label: 'Sailors served', value: '1,800+' },
    { label: 'Atlas units deployed', value: '320+' },
    { label: 'Continents', value: '3' },
  ],
  kicker:
    'Serving over 1,800 sailors in 2026 across North America, Europe, and South America.',
}

export type ServiceColumn = {
  title: string
  body: string
  examples: string[]
}

export const serviceColumns: ServiceColumn[] = [
  {
    title: 'Rentals at major regattas',
    body:
      'Vakaros Atlas 2 unit rentals at championship events. Sailors book, we ship to the venue, you race.',
    examples: ['Snipe World Championship', 'Star Western Hemisphere', 'U.S. Snipe Nationals'],
  },
  {
    title: 'Race-management deployment',
    body:
      'On-site race-committee support and data infrastructure for organizers running modern regattas.',
    examples: ['Garda Optimist Meeting clinic', 'High-school championships', 'MCSA Women’s Nationals'],
  },
  {
    title: 'Data platform for sailing',
    body:
      'Premier partner of Vakaros. Live tracking, course analytics, and post-race breakdown — bringing pro-grade data to dinghy sailing en masse.',
    examples: ['Live fleet tracking', 'Course analytics', 'Post-race delta analysis'],
  },
]

export type PastEvent = {
  slug: string
  name: string
  date_label: string
  location: string
  image: string
}

export const pastEvents: PastEvent[] = [
  {
    slug: 'snipe-don-q-2026',
    name: 'Snipe Don Q Regatta',
    date_label: 'February 2026',
    location: 'Miami, FL',
    image: '/events/_placeholder.jpg',
  },
  {
    slug: 'garda-opti-clinic-2026',
    name: 'Optimist Clinic — Garda',
    date_label: 'April 2026',
    location: 'Lake Garda, Italy',
    image: '/events/_placeholder.jpg',
  },
  {
    slug: 'opti-clinic-brazil-2026',
    name: 'Optimist Clinic — Brazil',
    date_label: 'January 2026',
    location: 'Brazil',
    image: '/events/_placeholder.jpg',
  },
  {
    slug: 'mcsa-womens-2026',
    name: 'MCSA Women’s Nationals',
    date_label: 'Spring 2026',
    location: 'United States',
    image: '/events/_placeholder.jpg',
  },
  {
    slug: 'star-western-hemisphere-2026',
    name: 'Star Western Hemisphere Championship',
    date_label: '2026',
    location: 'United States',
    image: '/events/_placeholder.jpg',
  },
  {
    slug: 'us-snipe-nationals-2026',
    name: 'U.S. Snipe National Championship',
    date_label: '2026',
    location: 'United States',
    image: '/events/_placeholder.jpg',
  },
]

export type Partner = {
  name: string
  logo: string
  premier?: boolean
}

export const partners: Partner[] = [
  { name: 'Vakaros', logo: '/vakaros_spec_transparent.png', premier: true },
  { name: 'Cyclops Marine', logo: '/partners/Cyclops-Marine-RGB.png' },
  { name: 'SailViewer', logo: '/partners/SailViewer.png' },
]
