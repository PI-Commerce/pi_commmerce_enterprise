/**
 * Operator edits to a session — escalation and assignment — held over the seeded
 * data.
 *
 * The agent sets escalation once, at close, from its disposition. That is the
 * machine's answer and it is often right — but it is a guess made by something
 * that has just left the conversation, and the person who picks the thread up is
 * the one who knows whether it actually needs them. So the mark is a starting
 * state, not a verdict: an operator can change it in the Inbox.
 *
 * Keyed by session id rather than by lead. A lead can carry several sessions and
 * only one of them is the escalated one; keying by lead would move the mark onto
 * whichever session happened to be rolled up that render.
 *
 * An override is stored only when it differs from what the agent set, so the two
 * stay distinguishable — "nobody has looked at this" is not the same state as
 * "somebody looked and agreed", and a map that cannot tell them apart loses the
 * ability to measure how often the agent was right.
 */
import { useSyncExternalStore } from "react";
import type { EscalationStatus } from "./inbound";

/**
 * Assignment, which nothing in the product used to write.
 *
 * `assigneeId` existed on every session and was set only by the seed generator,
 * so a conversation the agent marked for a person landed in Unassigned and no
 * action in the product could move it out. The queue had a backlog that could be
 * read and never claimed.
 *
 * `null` is a deliberate value, distinct from absent: it means somebody released
 * a conversation the seed had assigned, and without it the override map cannot
 * express "unassign" at all.
 */
type AssigneeOverride = string | null;

const overrides = new Map<string, EscalationStatus>();
const assignees = new Map<string, AssigneeOverride>();
const listeners = new Set<() => void>();

/* Replaced wholesale on each write so `useSyncExternalStore` sees a new
   reference — mutating the Map in place keeps the same identity and the Inbox
   would not re-render. */
let snapshot: ReadonlyMap<string, EscalationStatus> = new Map();
let assigneeSnapshot: ReadonlyMap<string, AssigneeOverride> = new Map();

function emit() {
  snapshot = new Map(overrides);
  assigneeSnapshot = new Map(assignees);
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Set — or clear, by passing the agent's own value — one session's escalation. */
export function setSessionEscalation(
  sessionId: string,
  next: EscalationStatus,
  agentSet: EscalationStatus,
) {
  if (next === agentSet) overrides.delete(sessionId);
  else overrides.set(sessionId, next);
  emit();
}

export function useEscalationOverrides(): ReadonlyMap<string, EscalationStatus> {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** The escalation to show: the operator's if they set one, else the agent's. */
export function resolveEscalation(
  map: ReadonlyMap<string, EscalationStatus>,
  sessionId: string | undefined,
  agentSet: EscalationStatus,
): EscalationStatus {
  return (sessionId && map.get(sessionId)) || agentSet;
}

/* ──────────────────────────── Assignment ────────────────────────────────── */

/**
 * Claim a conversation, hand it over, or put it back.
 *
 * Takes the escalation alongside it because the two axes have to stay coherent:
 * a session somebody has taken on is "handled by a person", and leaving it at
 * "needs a person" would keep it sorted to the top of a queue it has already
 * left. Setting them in one call is what stops the rail showing a row that is
 * both claimed and crying for help.
 */
export function assignSession(
  sessionId: string,
  operatorId: string | null,
  current: EscalationStatus,
) {
  assignees.set(sessionId, operatorId);
  if (operatorId && current === "needed") overrides.set(sessionId, "handled");
  /* Released back to the queue: if it was only "handled" because somebody held
     it, it needs a person again. */
  if (!operatorId && current === "handled") overrides.set(sessionId, "needed");
  emit();
}

export function useAssignees(): ReadonlyMap<string, AssigneeOverride> {
  return useSyncExternalStore(subscribe, () => assigneeSnapshot, () => assigneeSnapshot);
}

/** The assignee to show: the operator's edit if there is one, else the seeded value. */
export function resolveAssignee(
  map: ReadonlyMap<string, AssigneeOverride>,
  sessionId: string | undefined,
  seeded: string | undefined,
): string | undefined {
  if (!sessionId || !map.has(sessionId)) return seeded;
  return map.get(sessionId) ?? undefined;
}
