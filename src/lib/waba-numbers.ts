/**
 * The WhatsApp numbers this workspace can actually receive on.
 *
 * An entry point used to bind a free-text address, which let somebody type a
 * number the workspace had never onboarded and get an entry point that could
 * never fire — the inbound equivalent of a webhook URL the client invents.
 * Receiving is only possible on a number Meta has provisioned to a WABA we hold,
 * so the binding is a pick from this list, never typing.
 *
 * The mapping is three-dimensional, and all three levels have to be visible:
 *
 *   Business Manager  →  WABA  →  phone number
 *
 * That is Meta's own shape (it calls the first a Business Portfolio) and it is how
 * a business reasons about them. It matters here because the levels are owned by
 * different people and fail in different ways: a BM is the commercial entity and
 * is where billing and verification sit, a WABA carries the templates and the
 * messaging limit, and quality rating is per number. Two numbers on one WABA can
 * behave very differently, and an agency running several clients has several BMs
 * whose numbers must never be mixed into one journey by accident.
 *
 * Collapsing it to WABA → number, as this first did, loses exactly the distinction
 * that stops that happening.
 */
import { useSyncExternalStore } from "react";

export type WabaNumber = {
  /** Meta's `phone_number_id` — what webhooks arrive against. */
  id: string;
  /** E.164 as a person reads it. The only form shown in the UI. */
  display: string;
  /** The Business Manager (Meta: Business Portfolio) that owns the WABA. */
  bmId: string;
  bmName: string;
  wabaId: string;
  wabaName: string;
  /** What this number is for, in the business's own words. */
  label: string;
  verified: boolean;
  qualityRating: "High" | "Medium" | "Low";
};

const BM_ONE97 = { bmId: "2204118890034", bmName: "One97 Communications" };
const BM_PAYTM = { bmId: "1789442100981", bmName: "Paytm Commerce" };

const SEED: WabaNumber[] = [
  { ...BM_ONE97, id: "109844120", display: "+91 80 4718 2200", wabaId: "waba_sales_demo", wabaName: "Pi Agents Sales Demo", label: "Main line", verified: true, qualityRating: "High" },
  { ...BM_ONE97, id: "109844121", display: "+91 80313 40018", wabaId: "waba_sales_demo", wabaName: "Pi Agents Sales Demo", label: "Sales demo", verified: true, qualityRating: "High" },
  { ...BM_ONE97, id: "109844122", display: "+91 80 4718 2277", wabaId: "waba_support", wabaName: "Pi Support", label: "KYC line", verified: true, qualityRating: "High" },
  { ...BM_ONE97, id: "109844123", display: "+91 80 4718 2288", wabaId: "waba_support", wabaName: "Pi Support", label: "Returns desk", verified: true, qualityRating: "Medium" },
  /* A different Business Manager. Its numbers are the ones that must not quietly
     end up in the same journey as the above. */
  { ...BM_PAYTM, id: "109844124", display: "+91 22 6181 4400", wabaId: "waba_retail_west", wabaName: "Paytm Retail · West", label: "Mumbai stores", verified: true, qualityRating: "High" },
  { ...BM_PAYTM, id: "109844125", display: "+91 44 4299 7100", wabaId: "waba_retail_south", wabaName: "Paytm Retail · South", label: "Chennai stores", verified: false, qualityRating: "Medium" },
];

let numbers: WabaNumber[] = [...SEED];
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getWabaNumbers(): WabaNumber[] {
  return numbers;
}

export function useWabaNumbers(): WabaNumber[] {
  return useSyncExternalStore(subscribe, () => numbers, () => numbers);
}

/** Resolve a stored binding back to the number, by display form. */
export function wabaNumber(display: string): WabaNumber | undefined {
  return numbers.find((n) => n.display === display);
}

/**
 * Grouped the way the hierarchy runs, for a picker.
 *
 * Both levels are rendered rather than only the nearest one: a WABA name alone
 * does not say whose it is, and on a workspace running more than one Business
 * Manager that is the difference between two journeys and one mistake.
 */
export function numbersByBm(): {
  bmId: string;
  bmName: string;
  wabas: { wabaId: string; wabaName: string; numbers: WabaNumber[] }[];
}[] {
  const bms = new Map<string, { bmId: string; bmName: string; wabas: Map<string, { wabaId: string; wabaName: string; numbers: WabaNumber[] }> }>();
  for (const n of numbers) {
    const bm = bms.get(n.bmId) ?? { bmId: n.bmId, bmName: n.bmName, wabas: new Map() };
    const waba = bm.wabas.get(n.wabaId) ?? { wabaId: n.wabaId, wabaName: n.wabaName, numbers: [] };
    waba.numbers.push(n);
    bm.wabas.set(n.wabaId, waba);
    bms.set(n.bmId, bm);
  }
  return [...bms.values()].map((b) => ({ ...b, wabas: [...b.wabas.values()] }));
}
