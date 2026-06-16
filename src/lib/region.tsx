import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Workspace-level country / region.
 *
 * The country is chosen from the Dashboard and persisted to localStorage so the
 * selection survives navigation and reloads. Any screen that shows a
 * region-sensitive value (currency, timezone, phone dial code) reads
 * `useRegion()` so it tracks the active country.
 *
 * Only two markets are in scope for v1: India and UAE.
 */
export type CountryCode = "IN" | "AE";

export type RegionInfo = {
  country: CountryCode;
  /** Human label for the selector, e.g. "India". */
  label: string;
  /** ISO currency code, e.g. "INR". */
  code: string;
  /** Display symbol with any trailing space the prefix needs, e.g. "₹" / "AED ". */
  symbol: string;
  /** Demo threshold used in narrative copy (agent hand-off rule, etc.). */
  aumThreshold: string;
  /** IANA timezone, e.g. "Asia/Kolkata". */
  timezone: string;
  /** Full timezone label shown in selects, e.g. "Asia/Kolkata (IST)". */
  tzLabel: string;
  /** Short timezone abbreviation, e.g. "IST" / "GST". */
  tzAbbrev: string;
  /** Phone dial code, e.g. "+91" / "+971". */
  dialCode: string;
  /** Full country name for selectors, e.g. "India" / "United Arab Emirates". */
  countryName: string;
  /** Sample local phone number (national format) for demo prefills. */
  samplePhone: string;
  /** Demonym used in narrative copy, e.g. "Indian" / "UAE". */
  demonym: string;
};

const REGIONS: Record<CountryCode, RegionInfo> = {
  IN: {
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
  },
  AE: {
    country: "AE",
    label: "UAE",
    code: "AED",
    symbol: "AED ",
    aumThreshold: "AED 5M",
    timezone: "Asia/Dubai",
    tzLabel: "Asia/Dubai (GST)",
    tzAbbrev: "GST",
    dialCode: "+971",
    countryName: "United Arab Emirates",
    samplePhone: "50 123 4567",
    demonym: "UAE",
  },
};

export const COUNTRY_OPTIONS: RegionInfo[] = [REGIONS.IN, REGIONS.AE];

type RegionContextValue = RegionInfo & { setCountry: (c: CountryCode) => void };

const RegionContext = createContext<RegionContextValue | null>(null);

const STORAGE_KEY = "picom.country";

export function RegionProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState<CountryCode>("IN");

  // Hydrate from localStorage after mount (client-only) to avoid SSR mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "IN" || saved === "AE") setCountryState(saved);
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, []);

  const setCountry = (c: CountryCode) => {
    setCountryState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* ignore persistence failure */
    }
  };

  const value: RegionContextValue = { ...REGIONS[country], setCountry };

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion(): RegionContextValue {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be used within a RegionProvider");
  return ctx;
}

/**
 * Swap a hard-coded timezone abbreviation (IST/GST/…) at the end of a label
 * for the active region's abbreviation. Used to localize preset node subtitles
 * like "Call window 10:00–19:00 IST".
 */
export function localizeTzAbbrev(text: string, tzAbbrev: string): string {
  return text.replace(/\b(IST|GST|EST|GMT|PST)\b/g, tzAbbrev);
}

/**
 * Swap a leading international dial code (e.g. "+91", "+971") in a phone display
 * for the active region's dial code, keeping the national number intact. Used so
 * any connected-asset phone reads with the correct country code.
 */
export function localizeDialCode(text: string, dialCode: string): string {
  return text.replace(/^\+\d{1,4}/, dialCode);
}
