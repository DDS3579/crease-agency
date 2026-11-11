// DEMO DATA: replace before launch
export const projects = [
  {
    id: 'almada',
    name: 'Almada Ceramics',
    category: 'online store',
    year: 2025,
    sentence: 'A quiet storefront for hand-thrown ceramics, organised around the object rather than the catalogue.',
    stack: 'Storefront / CMS / Checkout',
    seed: 11
  },
  {
    id: 'seis',
    name: 'Seis Radio',
    category: 'streaming site',
    year: 2025,
    sentence: 'A listening room for a community radio station, with the player kept one thumb away.',
    stack: 'Audio / Schedule / Archive',
    seed: 23
  },
  {
    id: 'cinder',
    name: 'Cinder Bakery',
    category: 'ordering site',
    year: 2024,
    sentence: 'A morning-first ordering flow for a neighbourhood bakery, from loaf to pickup slot.',
    stack: 'Ordering / Menu / Pickup',
    seed: 37
  },
  {
    id: 'orla',
    name: 'Orla Dental',
    category: 'clinic website',
    year: 2024,
    sentence: 'A calm clinic site that makes booking, directions and aftercare easy to find.',
    stack: 'Booking / Content / Forms',
    seed: 51
  }
] as const;
