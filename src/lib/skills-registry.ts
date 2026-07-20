/**
 * useCase → attached-Skill map.
 *
 * v1 model (locked): Skills are NOT invoked from a Tool node. Instead, when a
 * campaign is created with a useCase, that pack's Skills auto-attach to the
 * campaign. At audience ingestion, each attached skill runs once per lead
 * (inputs mapped on the Audience node → outputs written to lead memory).
 *
 * Downstream nodes read `lead.memory.<skill_output>` via the variable picker.
 *
 * Currently only Personal Loan Collections is populated — every other useCase
 * points at an empty pack, so the Audience node cleanly shows "no skills"
 * instead of guessing.
 */

import type { UseCase } from "./campaign-types";
import { TOOLS, type ToolDef } from "./tool-registry";

export const USE_CASE_SKILLS: Partial<Record<UseCase, string[]>> = {
  personal_loan_collections: [
    "calculate_dpd_status",
    "calculate_dpd_bucket",
    "calculate_ptp_rate",
    "check_ptp_status",
    "check_right_party_connectivity",
  ],
};

/** Resolve the ToolDef list for a useCase — filters missing handles + non-skills. */
export function skillsForUseCase(useCase?: UseCase): ToolDef[] {
  if (!useCase) return [];
  const handles = USE_CASE_SKILLS[useCase] ?? [];
  return handles
    .map((h) => TOOLS.find((t) => t.handle === h))
    .filter((t): t is ToolDef => !!t && t.isSkill === true);
}
