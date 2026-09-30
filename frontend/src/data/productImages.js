const names = [
  'Quiet Hours Headphones', 'Field Notes Monitor', 'Everyday Canvas Tote', 'Daybreak Water Bottle',
  'Studio Wireless Speaker', 'Focus Desk Light', 'Weekender Carryall', 'Slow Morning Flask',
  'Pocket Sound Earbuds', 'Workday Keyboard', 'Daily Organizer', 'Trail Travel Bottle',
  'Analog Listening Set', 'Minimal Laptop Stand', 'Transit Crossbody', 'Still Ceramic Cup',
  'Sunday Mini Speaker', 'Canvas Desk Mat', 'Market Shopping Bag', 'Essential Thermos',
];
export const catalogueImages = Object.fromEntries(names.map(name => [name, `/images/products/${name.toLowerCase().replaceAll(' ', '-')}.webp`]));
// Only seeded products have editorial catalogue photography. New products use their uploaded image.
export const productImage = product => product.imageId ? `/api/assets/${product.imageId}` : catalogueImages[product.name];
export const categoryEdits = [
  { name: 'Audio', description: 'Find your focus.', image: catalogueImages['Quiet Hours Headphones'], number: '01' },
  { name: 'Workspace', description: 'Make room for good work.', image: catalogueImages['Focus Desk Light'], number: '02' },
  { name: 'Everyday', description: 'Take the good things along.', image: catalogueImages['Everyday Canvas Tote'], number: '03' },
  { name: 'Lifestyle', description: 'Enjoy the little rituals.', image: catalogueImages['Still Ceramic Cup'], number: '04' },
];
