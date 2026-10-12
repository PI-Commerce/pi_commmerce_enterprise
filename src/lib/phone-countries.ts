/**
 * Default-country options for phone normalisation.
 *
 * ISO 3166-1 alpha-2 + calling code. The value we persist / send is the ISO code,
 * which is exactly what the libphonenumber normaliser takes as its `defaultCountry`
 * argument. Shared by every place a merchant picks a default country — the Audience
 * node (CSV path) and the Get-cURL dialog (API path) — so both paths offer the same
 * list and resolve numbers identically.
 *
 * Curated common markets rather than the full ISO table; the workspace region is
 * pre-selected at each call site.
 */
export type PhoneCountryOption = { iso: string; name: string; dial: string };

export const COUNTRY_OPTIONS: PhoneCountryOption[] = [
  { iso: "IN", name: "India", dial: "+91" },
  { iso: "US", name: "United States", dial: "+1" },
  { iso: "GB", name: "United Kingdom", dial: "+44" },
  { iso: "AE", name: "United Arab Emirates", dial: "+971" },
  { iso: "SG", name: "Singapore", dial: "+65" },
  { iso: "AU", name: "Australia", dial: "+61" },
  { iso: "CA", name: "Canada", dial: "+1" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966" },
  { iso: "ID", name: "Indonesia", dial: "+62" },
  { iso: "BR", name: "Brazil", dial: "+55" },
];
