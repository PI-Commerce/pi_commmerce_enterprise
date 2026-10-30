/**
 * The shared cast of people.
 *
 * Inbound sessions and Inbox leads used to seed their own contacts from separate
 * name/phone pools, which meant the same human could never appear on both — a
 * session in Inbound had no lead to belong to, so its calls and messages had
 * nowhere to land in the Inbox. Both surfaces now draw from this one pool, so a
 * session's `contact.phone` is a real join key onto a `LeadRecord`.
 *
 * Deterministic and index-addressed: entry `i` is always the same person, so
 * hot reloads don't reshuffle who said what. Leaf module by design — importing
 * it must never pull `leads-data` or `inbound` into anything.
 */

export type PoolContact = { name: string; phone: string };

const FIRST = [
  "Aarav", "Vihaan", "Aditya", "Arjun", "Kabir", "Sai", "Ishaan", "Reyansh",
  "Ananya", "Aadhya", "Diya", "Ira", "Kavya", "Meera", "Riya", "Sara",
  "Rohan", "Neha", "Priya", "Rahul", "Sneha", "Vikram", "Anjali", "Karan",
  "Nisha", "Pooja", "Ravi", "Shreya", "Tanya", "Yash", "Zara", "Aman",
  "Divya", "Farhan", "Gauri", "Harsh", "Ishita", "Jai", "Kiran", "Lakshmi",
  "Anita", "Sanjay", "Tara", "Ishan", "Nikhil", "Rhea", "Varun", "Simran",
  "Dev", "Nandini",
];
const LAST = [
  "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Menon", "Reddy", "Rao",
  "Patel", "Shah", "Mehta", "Kapoor", "Malhotra", "Chopra", "Bhat",
  "Rangan", "Krishnan", "Bhargava", "Singhal", "Agarwal",
  "Kumar", "Khan", "Singh", "Joshi", "Das", "Bose",
];

/** Number of distinct people. Kept at the lead count so every lead has one. */
export const POOL_SIZE = 50;

/** Digits are a pure function of the index — no PRNG, so the phone for person
 *  `i` is identical in every module that asks for it. */
function phoneFor(i: number): string {
  const a = 6 + (i % 4);                       // 6/7/8/9
  const rest = String(100000000 + i * 7919).slice(0, 9);
  return `+91 ${a}${rest.slice(0, 4)} ${rest.slice(4, 8)}`;
}

export const CONTACT_POOL: PoolContact[] = Array.from({ length: POOL_SIZE }, (_, i) => ({
  name: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
  phone: phoneFor(i),
}));

/** Pool entry for an arbitrary index, wrapping. */
export function contactAt(i: number): PoolContact {
  return CONTACT_POOL[((i % POOL_SIZE) + POOL_SIZE) % POOL_SIZE];
}

/** Lead id for a pool index — the id scheme `leads-data` assigns. Lets inbound
 *  name the lead a session belongs to without importing the lead store. */
export function leadIdForPoolIndex(i: number): string {
  return `l_${String(1000 + (((i % POOL_SIZE) + POOL_SIZE) % POOL_SIZE))}`;
}
