/**
 * Catalog seed data — items and sets for the Catalog tab inside
 * Channels → WhatsApp. Scoped per WABA because a catalog is assigned
 * one-per-WABA in Meta (the catalog itself lives in the Business
 * Portfolio and can be shared across WABAs within that BM).
 *
 * Field shape mirrors Meta's Commerce catalog product schema so the UI
 * maps one-to-one with what `catalog_management` touches at the Graph API
 * level (POST /{catalog_id}/products, batch upserts, product sets).
 *
 * Terminology: Meta calls grouped-items "sets" (Commerce Manager) or
 * "sections" (per-MPM payload). We match Commerce Manager wording.
 */

export type ProductAvailability =
  | "in stock"
  | "out of stock"
  | "available for order"
  | "discontinued";

export type ProductCondition = "new" | "refurbished" | "used";

export type ProductVisibility = "published" | "staged";

export type CatalogProduct = {
  id: string;
  /** Merchant SKU / retailer_id — unique within the catalog. */
  retailerId: string;
  name: string;
  description: string;
  brand: string;
  price: number;
  salePrice?: number;
  currency: "INR" | "USD" | "AED";
  availability: ProductAvailability;
  condition: ProductCondition;
  visibility: ProductVisibility;
  imageUrl: string;
  url: string;
  gtin?: string;
  inventory: number;
  /** Sets this product belongs to (ids). An item can belong to many sets. */
  setIds: string[];
  updatedAt: string;
};

export type CatalogSet = {
  id: string;
  name: string;
  description: string;
  coverImageUrl: string;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Available catalogs in the Business Portfolio                        */
/* ------------------------------------------------------------------ */

/**
 * The catalogs our app has `catalog_management` permission on, scoped by
 * Business Manager. This is the pool the catalog picker lists from — in
 * production this comes from GET /{business_id}/owned_product_catalogs
 * once catalog_management is granted via Embedded Signup.
 */
export type AvailableCatalog = {
  catalogId: string;
  catalogName: string;
  businessId: string;
  businessName: string;
  itemCount: number;
  createdAt: string;
};

export const AVAILABLE_CATALOGS: AvailableCatalog[] = [
  {
    catalogId: "742819036451923",
    catalogName: "ACME Retail — Primary Catalog",
    businessId: "198347205612489",
    businessName: "Paytm Commerce",
    itemCount: 24,
    createdAt: "2026-07-04T10:15:00+05:30",
  },
  {
    catalogId: "742819036451924",
    catalogName: "ACME Retail — Festive 2026",
    businessId: "198347205612489",
    businessName: "Paytm Commerce",
    itemCount: 8,
    createdAt: "2026-09-10T10:00:00+05:30",
  },
  {
    catalogId: "742819036451925",
    catalogName: "ACME Services — Appointments",
    businessId: "198347205612489",
    businessName: "Paytm Commerce",
    itemCount: 12,
    createdAt: "2026-08-22T10:00:00+05:30",
  },
];

/* ------------------------------------------------------------------ */
/* Per-WABA catalog assignment (initial seed)                          */
/* ------------------------------------------------------------------ */

/**
 * Initial WABA → catalogId mapping. In production this is set in Meta's
 * commerce_settings on the phone number. The UI treats this as mutable
 * local state (see WhatsAppCatalog) so a "Change catalog" or "Link a
 * catalog" action updates it live.
 */
export const INITIAL_CATALOG_BY_WABA: Record<string, string | null> = {
  "104882190034771": "742819036451923",
};

export function catalogById(id: string | null | undefined): AvailableCatalog | null {
  if (!id) return null;
  return AVAILABLE_CATALOGS.find((c) => c.catalogId === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Sets                                                                */
/* ------------------------------------------------------------------ */

export const SEED_SETS: CatalogSet[] = [
  {
    id: "set_festive_2026",
    name: "Festive Picks 2026",
    description: "Curated gifting bundles for Diwali and year-end.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=640&q=75",
    productIds: ["prd_1001", "prd_1004", "prd_1010", "prd_1015", "prd_1022"],
    createdAt: "2026-09-14T10:12:00+05:30",
    updatedAt: "2026-10-20T15:45:00+05:30",
  },
  {
    id: "set_audio_bestsellers",
    name: "Audio Bestsellers",
    description: "Top audio products by last-30-day sell-through.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=640&q=75",
    productIds: ["prd_1001", "prd_1002", "prd_1003", "prd_1017", "prd_1018"],
    createdAt: "2026-08-02T11:00:00+05:30",
    updatedAt: "2026-10-24T09:30:00+05:30",
  },
  {
    id: "set_fitness_launch",
    name: "Fitness Launch",
    description: "New wearables and fitness line.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=640&q=75",
    productIds: ["prd_1005", "prd_1006", "prd_1019", "prd_1020"],
    createdAt: "2026-10-05T14:20:00+05:30",
    updatedAt: "2026-10-26T18:00:00+05:30",
  },
  {
    id: "set_kitchen_essentials",
    name: "Kitchen Essentials",
    description: "Everyday kitchen staples.",
    coverImageUrl:
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=640&q=75",
    productIds: ["prd_1011", "prd_1012", "prd_1013", "prd_1014"],
    createdAt: "2026-07-18T10:00:00+05:30",
    updatedAt: "2026-10-21T12:10:00+05:30",
  },
];

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

const IMG = {
  earbuds:
    "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=640&q=75",
  headphones:
    "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=640&q=75",
  speaker:
    "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=640&q=75",
  watch:
    "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=640&q=75",
  band:
    "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?auto=format&fit=crop&w=640&q=75",
  lamp:
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=640&q=75",
  diffuser:
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=640&q=75",
  airpurifier:
    "https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=640&q=75",
  kettle:
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=640&q=75",
  blender:
    "https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=640&q=75",
  toaster:
    "https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=640&q=75",
  bottle:
    "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=640&q=75",
  yogamat:
    "https://images.unsplash.com/photo-1591291621164-2c6367723315?auto=format&fit=crop&w=640&q=75",
  dumbbell:
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=640&q=75",
  resistance:
    "https://images.unsplash.com/photo-1434596922112-19c563067271?auto=format&fit=crop&w=640&q=75",
  charger:
    "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=640&q=75",
  cable:
    "https://images.unsplash.com/photo-1588702547923-7093a6c3ba33?auto=format&fit=crop&w=640&q=75",
  powerbank:
    "https://images.unsplash.com/photo-1609592806598-08eb11dbaa89?auto=format&fit=crop&w=640&q=75",
  trimmer:
    "https://images.unsplash.com/photo-1621607512022-6bb8c47b1b50?auto=format&fit=crop&w=640&q=75",
  toothbrush:
    "https://images.unsplash.com/photo-1559591935-c6e5f29c9e91?auto=format&fit=crop&w=640&q=75",
};

export const SEED_PRODUCTS: CatalogProduct[] = [
  { id: "prd_1001", retailerId: "ACME-AUD-001", name: "ACME Buds Pro 2", description: "Active noise cancellation earbuds with 36 hours of total battery life, Bluetooth 5.3, and IPX5 water resistance.", brand: "ACME", price: 4499, salePrice: 3799, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.earbuds, url: "https://shop.acme.in/p/acme-buds-pro-2", gtin: "08901234500011", inventory: 1240, setIds: ["set_festive_2026", "set_audio_bestsellers"], updatedAt: "2026-10-26T11:00:00+05:30" },
  { id: "prd_1002", retailerId: "ACME-AUD-002", name: "ACME Studio Wireless Over-Ear", description: "Over-ear wireless headphones with 40mm drivers, 50-hour playback, and adaptive EQ.", brand: "ACME", price: 8999, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.headphones, url: "https://shop.acme.in/p/acme-studio-wireless", gtin: "08901234500028", inventory: 320, setIds: ["set_audio_bestsellers"], updatedAt: "2026-10-20T09:30:00+05:30" },
  { id: "prd_1003", retailerId: "ACME-AUD-003", name: "ACME SoundBloom Speaker", description: "Portable Bluetooth speaker with 20W output, 24-hour playtime, and IP67 rating.", brand: "ACME", price: 3499, salePrice: 2999, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.speaker, url: "https://shop.acme.in/p/acme-soundbloom", gtin: "08901234500035", inventory: 540, setIds: ["set_audio_bestsellers"], updatedAt: "2026-10-22T14:10:00+05:30" },
  { id: "prd_1004", retailerId: "ACME-WEA-001", name: "ACME Pulse Smartwatch", description: "AMOLED display, SpO2, 24x7 heart rate, 100+ sports modes, and 10-day battery.", brand: "ACME", price: 6999, salePrice: 5999, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.watch, url: "https://shop.acme.in/p/acme-pulse", gtin: "08901234500042", inventory: 870, setIds: ["set_festive_2026"], updatedAt: "2026-10-25T10:45:00+05:30" },
  { id: "prd_1005", retailerId: "ACME-WEA-002", name: "ACME Fit Band 7", description: "Lightweight fitness band with step, calorie, and sleep tracking, 14-day battery.", brand: "ACME", price: 2499, currency: "INR", availability: "available for order", condition: "new", visibility: "staged", imageUrl: IMG.band, url: "https://shop.acme.in/p/acme-fit-band-7", gtin: "08901234500059", inventory: 0, setIds: ["set_fitness_launch"], updatedAt: "2026-10-26T18:00:00+05:30" },
  { id: "prd_1006", retailerId: "ACME-WEA-003", name: "ACME Pulse Pro Smartwatch", description: "Premium titanium-frame smartwatch with always-on AMOLED, ECG, and GPS.", brand: "ACME", price: 12999, currency: "INR", availability: "available for order", condition: "new", visibility: "staged", imageUrl: IMG.watch, url: "https://shop.acme.in/p/acme-pulse-pro", gtin: "08901234500066", inventory: 0, setIds: ["set_fitness_launch"], updatedAt: "2026-10-26T18:02:00+05:30" },
  { id: "prd_1010", retailerId: "ACME-HOM-001", name: "ACME Lumen Table Lamp", description: "Touch-dim bedside lamp with 3 colour temperatures and USB-C charging.", brand: "ACME", price: 1899, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.lamp, url: "https://shop.acme.in/p/acme-lumen-lamp", gtin: "08901234500103", inventory: 420, setIds: ["set_festive_2026"], updatedAt: "2026-10-18T12:00:00+05:30" },
  { id: "prd_1011", retailerId: "ACME-KIT-001", name: "ACME Electric Kettle 1.5L", description: "1500W glass kettle with auto-shutoff and boil-dry protection.", brand: "ACME", price: 1499, salePrice: 1199, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.kettle, url: "https://shop.acme.in/p/acme-kettle-15", gtin: "08901234500110", inventory: 760, setIds: ["set_kitchen_essentials"], updatedAt: "2026-10-19T15:30:00+05:30" },
  { id: "prd_1012", retailerId: "ACME-KIT-002", name: "ACME Mix Pro Blender", description: "600W personal blender with 2 travel jars and dishwasher-safe blades.", brand: "ACME", price: 2299, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.blender, url: "https://shop.acme.in/p/acme-mix-pro", gtin: "08901234500127", inventory: 290, setIds: ["set_kitchen_essentials"], updatedAt: "2026-10-10T11:00:00+05:30" },
  { id: "prd_1013", retailerId: "ACME-KIT-003", name: "ACME Pop Toaster 2-Slice", description: "750W pop-up toaster with 7 browning levels, defrost, and reheat.", brand: "ACME", price: 1299, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.toaster, url: "https://shop.acme.in/p/acme-pop-toaster", gtin: "08901234500134", inventory: 180, setIds: ["set_kitchen_essentials"], updatedAt: "2026-10-15T09:00:00+05:30" },
  { id: "prd_1014", retailerId: "ACME-KIT-004", name: "ACME Hydro Bottle 1L", description: "Insulated stainless steel bottle; keeps cold 24 hours, hot 12 hours.", brand: "ACME", price: 999, salePrice: 749, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.bottle, url: "https://shop.acme.in/p/acme-hydro-bottle", gtin: "08901234500141", inventory: 1540, setIds: ["set_kitchen_essentials"], updatedAt: "2026-10-21T12:10:00+05:30" },
  { id: "prd_1015", retailerId: "ACME-HOM-002", name: "ACME Aroma Diffuser Pro", description: "250ml ultrasonic diffuser with 7 LED colours and whisper-quiet operation.", brand: "ACME", price: 1799, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.diffuser, url: "https://shop.acme.in/p/acme-aroma-diffuser", gtin: "08901234500158", inventory: 310, setIds: ["set_festive_2026"], updatedAt: "2026-10-16T14:00:00+05:30" },
  { id: "prd_1016", retailerId: "ACME-HOM-003", name: "ACME Pure Air Purifier", description: "H13 HEPA + activated carbon purifier, 30 sqm coverage, auto mode, app control.", brand: "ACME", price: 7499, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.airpurifier, url: "https://shop.acme.in/p/acme-pure-air", gtin: "08901234500165", inventory: 90, setIds: [], updatedAt: "2026-10-12T10:00:00+05:30" },
  { id: "prd_1017", retailerId: "ACME-AUD-004", name: "ACME Buds Lite", description: "Entry-level earbuds with 24-hour battery, Bluetooth 5.2, and ENC call clarity.", brand: "ACME", price: 1799, salePrice: 1499, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.earbuds, url: "https://shop.acme.in/p/acme-buds-lite", gtin: "08901234500172", inventory: 2210, setIds: ["set_audio_bestsellers"], updatedAt: "2026-10-24T09:30:00+05:30" },
  { id: "prd_1018", retailerId: "ACME-AUD-005", name: "ACME Neckband NB50", description: "Magnetic-earpiece neckband with 50-hour playback and dual-device pairing.", brand: "ACME", price: 1299, currency: "INR", availability: "out of stock", condition: "new", visibility: "published", imageUrl: IMG.headphones, url: "https://shop.acme.in/p/acme-neckband-nb50", gtin: "08901234500189", inventory: 0, setIds: ["set_audio_bestsellers"], updatedAt: "2026-10-14T11:00:00+05:30" },
  { id: "prd_1019", retailerId: "ACME-FIT-001", name: "ACME GripFlex Yoga Mat", description: "6mm non-slip TPE yoga mat with carry strap. Latex-free materials.", brand: "ACME", price: 1499, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.yogamat, url: "https://shop.acme.in/p/acme-yoga-mat", gtin: "08901234500196", inventory: 440, setIds: ["set_fitness_launch"], updatedAt: "2026-10-26T18:05:00+05:30" },
  { id: "prd_1020", retailerId: "ACME-FIT-002", name: "ACME Resistance Bands Set", description: "Set of 5 colour-coded resistance bands with door anchor and carry pouch.", brand: "ACME", price: 899, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.resistance, url: "https://shop.acme.in/p/acme-resistance-bands", gtin: "08901234500202", inventory: 680, setIds: ["set_fitness_launch"], updatedAt: "2026-10-26T18:08:00+05:30" },
  { id: "prd_1021", retailerId: "ACME-FIT-003", name: "ACME 5kg Adjustable Dumbbell", description: "Compact adjustable dumbbell, 2.5kg to 5kg per side.", brand: "ACME", price: 2999, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.dumbbell, url: "https://shop.acme.in/p/acme-dumbbell-5", gtin: "08901234500219", inventory: 130, setIds: [], updatedAt: "2026-10-08T10:00:00+05:30" },
  { id: "prd_1022", retailerId: "ACME-MOB-001", name: "ACME 65W GaN Fast Charger", description: "Compact GaN travel charger, USB-C PD + Quick Charge 4+, folding plug.", brand: "ACME", price: 2199, salePrice: 1799, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.charger, url: "https://shop.acme.in/p/acme-gan-65w", gtin: "08901234500226", inventory: 980, setIds: ["set_festive_2026"], updatedAt: "2026-10-23T15:00:00+05:30" },
  { id: "prd_1023", retailerId: "ACME-MOB-002", name: "ACME Braided USB-C Cable 1.5m", description: "Nylon-braided USB-C to USB-C cable, 100W PD, 10Gbps data.", brand: "ACME", price: 499, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.cable, url: "https://shop.acme.in/p/acme-braided-usbc", gtin: "08901234500233", inventory: 3200, setIds: [], updatedAt: "2026-10-11T09:00:00+05:30" },
  { id: "prd_1024", retailerId: "ACME-MOB-003", name: "ACME PowerVault 20000 Power Bank", description: "20000mAh power bank with 22.5W fast charging and digital charge display.", brand: "ACME", price: 2499, salePrice: 1999, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.powerbank, url: "https://shop.acme.in/p/acme-powervault-20000", gtin: "08901234500240", inventory: 610, setIds: [], updatedAt: "2026-10-17T14:00:00+05:30" },
  { id: "prd_1030", retailerId: "ACME-PER-001", name: "ACME Groom Trimmer T30", description: "Cordless beard and body trimmer, 90-min runtime, waterproof.", brand: "ACME", price: 1699, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.trimmer, url: "https://shop.acme.in/p/acme-trimmer-t30", gtin: "08901234500301", inventory: 420, setIds: [], updatedAt: "2026-10-13T10:00:00+05:30" },
  { id: "prd_1031", retailerId: "ACME-PER-002", name: "ACME Sonic Toothbrush Pro", description: "40,000 vibrations/min sonic toothbrush, 5 modes, 2-min smart timer.", brand: "ACME", price: 2199, currency: "INR", availability: "in stock", condition: "new", visibility: "published", imageUrl: IMG.toothbrush, url: "https://shop.acme.in/p/acme-sonic-toothbrush", gtin: "08901234500318", inventory: 240, setIds: [], updatedAt: "2026-10-09T10:00:00+05:30" },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const CURRENCY_SYMBOL: Record<CatalogProduct["currency"], string> = {
  INR: "₹",
  USD: "$",
  AED: "AED ",
};

export function formatPrice(amount: number, currency: CatalogProduct["currency"]): string {
  return `${CURRENCY_SYMBOL[currency]}${amount.toLocaleString("en-IN")}`;
}

export function productsBySet(all: CatalogProduct[], setId: string): CatalogProduct[] {
  return all.filter((p) => p.setIds.includes(setId));
}

export const PRODUCT_AVAILABILITIES: ProductAvailability[] = [
  "in stock",
  "out of stock",
  "available for order",
  "discontinued",
];

/** Meta Catalog item field limits — enforced in the create/edit UI so the
 *  record is API-shaped by construction. Numbers from Meta's Commerce
 *  catalog item spec (Graph API v23+). GTIN must be 8/12/13/14 digits. */
export const META_PRODUCT_LIMITS = {
  name: 150,
  description: 9999,
  brand: 100,
  retailerId: 100,
  gtinDigits: [8, 12, 13, 14] as const,
} as const;

export function isValidGtin(v: string | undefined): boolean {
  if (!v) return true; // optional
  return /^\d+$/.test(v) && META_PRODUCT_LIMITS.gtinDigits.some((n) => v.length === n);
}
