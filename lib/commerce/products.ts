import type { StorefrontProduct } from './types'

export const storefrontProducts: StorefrontProduct[] = [
  {
    id: 'atlas-2',
    slug: 'atlas-2',
    name: 'Vakaros Atlas 2',
    subtitle: 'The most accurate instrument on the water.',
    descriptionShort:
      'Dual-band L1 + L5 GNSS, 25Hz updates, advanced compass fidelity, and 100+ hour battery life for elite race performance.',
    pricing: {
      amountCents: 124900,
      currency: 'usd',
      taxIncluded: true,
    },
    inTheBox: ['Atlas 2', 'Mount', 'Carrying case'],
    sections: [
      {
        key: 'accuracy',
        heading: 'The most accurate instrument on the water. Ever.',
        body: 'Atlas 2 is the first sailing instrument capable of dual-band L1 + L5 GNSS reception, designed to deliver positional accuracy in centimeters.',
        bullets: [
          'Optimized for L1 + L5 signals to reduce ionosphere and multi-path errors',
          'Multi-constellation reception: GPS, Galileo, GLONASS, and BeiDou',
          '25Hz update rate for faster race-critical feedback',
          'Up to 25cm positional accuracy with RaceSense networks',
        ],
      },
      {
        key: 'compass',
        heading: 'A compass that understands what is happening.',
        body: 'A highly sensitive magnetic package, advanced motion fusion, and adjustable damping keep heading data stable in rough conditions.',
        bullets: [
          '0.1 degree heading resolution',
          'Gyro-stabilized output',
          'Motion fusion at 50Hz',
          'Reference angles to track shifts with confidence',
        ],
      },
      {
        key: 'starting',
        heading: 'Win the start, control the fleet.',
        body: 'Distance-to-line and time-to-line outputs are tuned for tactical starting decisions so crews can hit the line with speed and timing.',
        bullets: [
          'Distance-to-line and time-to-line calculations',
          'Time-to-burn support for synchronized final approach',
          'Starting screens optimized for situational awareness',
        ],
      },
      {
        key: 'battery',
        heading: '100+ hour battery, wirelessly rechargeable.',
        body: 'Atlas 2 pairs Qi-compatible charging with long endurance so teams can run regatta schedules without constant battery management.',
        bullets: [
          '100+ hour runtime',
          '4600mAh integrated lithium-ion battery',
          'Fast top-up window supports all-day sessions',
        ],
      },
    ],
    techSpecs: [
      {
        group: 'Sensors',
        rows: [
          { label: 'GNSS', value: '25Hz L1 + L5 dual-band multi-constellation receiver' },
          { label: 'Motion', value: '3-axis gyroscope and 3-axis accelerometer' },
          { label: 'Direction', value: '3-axis magnetometer' },
          { label: 'Environmental', value: 'Ambient light and temperature sensors' },
        ],
      },
      {
        group: 'Core Measurements',
        rows: [
          { label: 'Position + Velocity', value: 'High-frequency race telemetry' },
          { label: 'Heading / Heel / Pitch', value: 'Derived from stabilized fusion stack' },
          { label: 'Data Logging', value: '10Hz internal logging support' },
        ],
      },
      {
        group: 'Display',
        rows: [
          { label: 'Screen', value: '4.4 inch transflective LCD, 320x240, 91ppi' },
          { label: 'Visibility', value: 'Sunlight-readable with 160 degree viewing cone' },
          { label: 'Lens', value: 'Optically bonded Gorilla Glass with AR + hydrophobic coating' },
        ],
      },
      {
        group: 'Battery + Storage',
        rows: [
          { label: 'Runtime', value: '100+ hours typical usage' },
          { label: 'Charging', value: 'Qi-compatible wireless charging' },
          { label: 'Storage', value: '256MB integrated storage for onboard logs' },
        ],
      },
      {
        group: 'Functions',
        rows: [
          { label: 'Starting', value: 'Distance-to-line, time-to-line, time-to-burn' },
          { label: 'Race Tools', value: 'Countdown timer, shift tracking, stripchart, VMG' },
        ],
      },
    ],
    addOns: [
      {
        id: 'vakaros-care-warranty',
        slug: 'vakaros-care-warranty',
        name: 'Vakaros Care Warranty',
        description:
          'One-time replacement coverage for accidental damage, enclosure/screen damage, or lost/stolen device for up to 2 years.',
        priceCents: 20000,
        addonType: 'warranty',
      },
    ],
    rentalPolicy: {
      rentalPriceCents: 24500,
      lateFeeCents: 3500,
      reserveCutoffDays: 14,
      statuses: ['in_stock', 'inventory_on_the_way', 'out_of_stock'],
      requiresEventSelection: true,
      requiresSailNumber: true,
    },
    support: {
      manualUrl: 'https://support.vakaros.com/',
    },
  },
]

export function getProductBySlug(slug: string) {
  return storefrontProducts.find((product) => product.slug === slug)
}
