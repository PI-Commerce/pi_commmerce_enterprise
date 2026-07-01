import { createContext, useContext, type ReactNode } from "react";

/**
 * Workspace region.
 *
 * India is the only market on this branch — the UAE variant lives on the
 * `uae` branch. The hook API is preserved so all region-sensitive call sites
 * (currency, timezone, dial code, template languages) keep working without
 * changes.
 */
export type CountryCode = "IN";

export type RegionInfo = {
  country: CountryCode;
  label: string;
  code: string;
  symbol: string;
  aumThreshold: string;
  timezone: string;
  tzLabel: string;
  tzAbbrev: string;
  dialCode: string;
  countryName: string;
  samplePhone: string;
  demonym: string;
  templateLanguages: string[];
};

const IN_REGION: RegionInfo = {
  country: "IN",
  label: "India",
  code: "INR",
  symbol: "₹",
  aumThreshold: "₹10L",
  timezone: "Asia/Kolkata",
  tzLabel: "Asia/Kolkata (IST)",
  tzAbbrev: "IST",
  dialCode: "+91",
  countryName: "India",
  samplePhone: "98100 12345",
  demonym: "Indian",
  templateLanguages: ["en_US", "en", "hi", "mr", "ta", "te", "bn", "gu"],
};

type RegionContextValue = RegionInfo;

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ children }: { children: ReactNode }) {
  return <RegionContext.Provider value={IN_REGION}>{children}</RegionContext.Provider>;
}

export function useRegion(): RegionContextValue {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be used within a RegionProvider");
  return ctx;
}

export function localizeTzAbbrev(text: string, tzAbbrev: string): string {
  return text.replace(/\b(IST|GST|EST|GMT|PST)\b/g, tzAbbrev);
}

export function localizeDialCode(text: string, dialCode: string): string {
  return text.replace(/^\+\d{1,4}/, dialCode);
}

export function localizeCurrency(text: string, symbol: string): string {
  return text.replace(/₹\s?|AED\s?/g, symbol);
}
