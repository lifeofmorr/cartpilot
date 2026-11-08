// Demo marketplace catalog.
//
// Each product is sold by one marketplace seller. The list price and rating are
// public (what the agent sees when it "searches the marketplace"). The seller's
// floorPrice is private: it is the lowest price the seller will accept during
// negotiation and is never exposed through the API or the UI.
//
// Categories are the mandate allowlist vocabulary.

export const CATEGORIES = [
  "coffee & kitchen",
  "office supplies",
  "cleaning",
  "tech accessories",
  "pantry",
];

export const PRODUCTS = [
  {
    id: "coffee-ethiopia-1kg",
    name: "Ethiopian Yirgacheffe Coffee Beans 1kg",
    category: "coffee & kitchen",
    unit: "bag",
    listPrice: 18.5,
    rating: 4.8,
    seller: { name: "Highland Roasters", floorPrice: 14.2 },
    keywords: ["coffee", "beans", "espresso", "yirgacheffe"],
  },
  {
    id: "coffee-colombia-1kg",
    name: "Colombian Supremo Coffee Beans 1kg",
    category: "coffee & kitchen",
    unit: "bag",
    listPrice: 15.9,
    rating: 4.6,
    seller: { name: "Andes Coffee Co.", floorPrice: 12.4 },
    keywords: ["coffee", "beans", "colombian"],
  },
  {
    id: "coffee-filters-200",
    name: "Unbleached Coffee Filters, 200 Count",
    category: "coffee & kitchen",
    unit: "box",
    listPrice: 8.25,
    rating: 4.5,
    seller: { name: "KitchenBasics", floorPrice: 6.6 },
    keywords: ["filter", "filters", "coffee"],
  },
  {
    id: "ceramic-mugs-6",
    name: "Stoneware Mug Set, 6 Pieces",
    category: "coffee & kitchen",
    unit: "set",
    listPrice: 27.99,
    rating: 4.7,
    seller: { name: "Kiln & Co.", floorPrice: 22.5 },
    keywords: ["mug", "mugs", "cup", "cups"],
  },
  {
    id: "oat-milk-6pk",
    name: "Barista Oat Milk, 6 x 1L",
    category: "pantry",
    unit: "case",
    listPrice: 19.4,
    rating: 4.4,
    seller: { name: "PantryDirect", floorPrice: 16.1 },
    keywords: ["oat milk", "milk", "barista"],
  },
  {
    id: "paper-towels-12",
    name: "Recycled Paper Towels, 12 Rolls",
    category: "cleaning",
    unit: "pack",
    listPrice: 16.75,
    rating: 4.3,
    seller: { name: "CleanSupply", floorPrice: 13.9 },
    keywords: ["paper towels", "towels", "paper towel"],
  },
  {
    id: "hand-soap-4",
    name: "Foaming Hand Soap Refill, 4 Pack",
    category: "cleaning",
    unit: "pack",
    listPrice: 12.3,
    rating: 4.6,
    seller: { name: "CleanSupply", floorPrice: 9.8 },
    keywords: ["soap", "hand soap"],
  },
  {
    id: "surface-spray-3",
    name: "All-Purpose Surface Spray, 3 Pack",
    category: "cleaning",
    unit: "pack",
    listPrice: 11.99,
    rating: 4.2,
    seller: { name: "BrightHome", floorPrice: 9.5 },
    keywords: ["spray", "cleaner", "surface spray", "cleaning spray"],
  },
  {
    id: "notebooks-a5-5",
    name: "A5 Dotted Notebooks, 5 Pack",
    category: "office supplies",
    unit: "pack",
    listPrice: 21.0,
    rating: 4.7,
    seller: { name: "PaperTrail", floorPrice: 16.8 },
    keywords: ["notebook", "notebooks", "journal"],
  },
  {
    id: "pens-gel-24",
    name: "Gel Pens Black, 24 Pack",
    category: "office supplies",
    unit: "pack",
    listPrice: 9.99,
    rating: 4.5,
    seller: { name: "PaperTrail", floorPrice: 7.4 },
    keywords: ["pen", "pens", "gel pens"],
  },
  {
    id: "sticky-notes-12",
    name: "Sticky Notes Assorted, 12 Pads",
    category: "office supplies",
    unit: "pack",
    listPrice: 7.85,
    rating: 4.4,
    seller: { name: "DeskWorks", floorPrice: 6.1 },
    keywords: ["sticky notes", "post-it", "notes"],
  },
  {
    id: "usb-c-cable-2",
    name: "Braided USB-C Cable 2m, 2 Pack",
    category: "tech accessories",
    unit: "pack",
    listPrice: 14.5,
    rating: 4.6,
    seller: { name: "VoltEdge", floorPrice: 11.0 },
    keywords: ["usb", "cable", "usb-c", "charger cable"],
  },
  {
    id: "wireless-mouse",
    name: "Ergonomic Wireless Mouse",
    category: "tech accessories",
    unit: "piece",
    listPrice: 24.99,
    rating: 4.5,
    seller: { name: "VoltEdge", floorPrice: 19.9 },
    keywords: ["mouse", "wireless mouse"],
  },
  {
    id: "desk-lamp-led",
    name: "LED Desk Lamp with Dimmer",
    category: "tech accessories",
    unit: "piece",
    listPrice: 32.5,
    rating: 4.3,
    seller: { name: "BrightHome", floorPrice: 26.0 },
    keywords: ["lamp", "desk lamp", "led lamp"],
  },
  {
    id: "granola-bars-48",
    name: "Oat Granola Bars, 48 Count",
    category: "pantry",
    unit: "box",
    listPrice: 22.75,
    rating: 4.4,
    seller: { name: "PantryDirect", floorPrice: 18.6 },
    keywords: ["granola", "snack", "snacks", "bars"],
  },
  {
    id: "sparkling-water-24",
    name: "Sparkling Water Variety, 24 Cans",
    category: "pantry",
    unit: "case",
    listPrice: 17.25,
    rating: 4.5,
    seller: { name: "PantryDirect", floorPrice: 14.3 },
    keywords: ["sparkling water", "water", "seltzer", "drinks"],
  },
];

// Public view: everything except the seller's private floor price.
export function publicCatalog() {
  return PRODUCTS.map(({ seller, ...rest }) => ({
    ...rest,
    seller: seller.name,
  }));
}

export function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}
