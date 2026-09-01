/**
 * SMS templates — demo data + types for the SMS Template Registry
 * (Channels → SMS → Templates tab).
 *
 * Under India's TRAI/DLT regime the message content + Template ID are approved
 * on the *client's* DLT panel. What lives here is a **copy** of that approved
 * record, not a new registration — Pi Commerce never submits anything to DLT.
 * The Template *Name* is a Pi Commerce label for identifying the template in the
 * dashboard (it is not extracted from DLT); the Template ID and content are the
 * DLT-issued facts. Because there is no API to re-check approval against the DLT
 * panel, every entry is treated as active and pre-verified; that is why
 * {@link SmsTemplate} carries no approval status (unlike
 * {@link file://./waba-templates.ts}, whose templates track Meta's review).
 *
 * Message content uses **named** `{{var}}` placeholders, which is the DLT
 * convention — deliberately different from WhatsApp's numbered `{{1}}`. See
 * {@link smsPlaceholders}.
 */

/** Encoding + delivery class, as registered on DLT. "Class 0" = flash SMS. */
export type SmsType = "Text" | "Unicode" | "Text-class 0" | "Unicode-class 0";

/** Template category — the kind of message it carries. */
export type SmsCategory = "Promotional" | "Transactional";

export type SmsTemplate = {
  /** DLT-issued Template ID, mirrored verbatim from the client's DLT panel. */
  id: string;
  /** Pi Commerce label for this template — NOT extracted from DLT. */
  name: string;
  smsType: SmsType;
  category: SmsCategory;
  /** Principal Entity ID the template is registered under. */
  peId: string;
  /** Registered sender (header), e.g. "PICOMM". */
  senderId: string;
  /** Message body with named `{{var}}` placeholders. */
  content: string;
  /** Display date, e.g. "22 Jul 2026" — matches the WhatsApp registry format. */
  createdAt: string;
};

export const SMS_TYPES: SmsType[] = ["Text", "Unicode", "Text-class 0", "Unicode-class 0"];
export const SMS_CATEGORIES: SmsCategory[] = ["Promotional", "Transactional"];

/** Whether a type is one of the Unicode (UCS-2) encodings. */
export function isUnicodeType(t: SmsType): boolean {
  return t === "Unicode" || t === "Unicode-class 0";
}

/** Whether a type sends as a flash (class 0) message. */
export function isFlashType(t: SmsType): boolean {
  return t === "Text-class 0" || t === "Unicode-class 0";
}

/* --------------------------- Variables --------------------------- */

/**
 * Distinct named placeholders in a DLT template body, in first-appearance order.
 * Returns the bare names (`{{amount}}` → `amount`).
 *
 * DLT names its variables; WhatsApp numbers them. The WhatsApp parser in
 * ConfigPanel matches `{{\d+}}` and cannot be reused here.
 */
export function smsPlaceholders(text?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of (text ?? "").matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    const name = m[1];
    if (!seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

/** Substitute sample/mapped values into a body for preview. Unfilled vars stay literal. */
export function fillSmsVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, name: string) => {
    const v = values[name];
    return v && v.trim() ? v : m;
  });
}

/* --------------------------- Segments --------------------------- */

/**
 * Per-message character budgets. A message that fits in one part gets the
 * `single` budget; once it splits, each part loses 6-7 characters to the
 * concatenation (UDH) header, hence the smaller `multi` budget.
 *
 *   GSM-7  — 160 single / 153 per part
 *   UCS-2  — 70 single / 67 per part
 */
const SEGMENT_LIMITS = {
  gsm: { single: 160, multi: 153 },
  ucs2: { single: 70, multi: 67 },
} as const;

/**
 * Characters that occupy **two** GSM-7 septets via the extension table. Any
 * character outside the GSM-7 alphabet entirely forces the whole message to
 * UCS-2 (e.g. Devanagari, emoji).
 */
const GSM_EXTENDED = "^{}\\[~]|€";
const GSM_BASE =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** Whether every character is representable in the GSM-7 alphabet. */
export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM_BASE.includes(ch) && !GSM_EXTENDED.includes(ch)) return false;
  }
  return true;
}

export type SegmentInfo = {
  /** Billable parts — the "SMS count" the platform reports per recipient. */
  segments: number;
  /** Encoded length in septets (GSM-7) or code units (UCS-2). */
  length: number;
  encoding: "GSM-7" | "UCS-2";
  /** Characters still available in the current last segment. */
  remaining: number;
};

/**
 * Segment count for a message body — the per-recipient "SMS count" required by
 * the campaign report (PICOM-4726 §5).
 *
 * `type` forces UCS-2 for the Unicode variants even when the sample text is
 * plain ASCII, because the registered encoding is what the vendor bills on. For
 * the Text variants the content decides: a single non-GSM character (a rupee
 * glyph, an emoji, Devanagari) silently promotes the whole message to UCS-2.
 */
export function smsSegments(text: string, type: SmsType = "Text"): SegmentInfo {
  const unicode = isUnicodeType(type) || !isGsm7(text);
  const limits = unicode ? SEGMENT_LIMITS.ucs2 : SEGMENT_LIMITS.gsm;
  // GSM-7 extended characters cost two septets; UCS-2 counts astral characters
  // as two code units, which [...text] would otherwise collapse into one.
  const length = unicode
    ? Array.from(text).reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0)
    : Array.from(text).reduce((n, ch) => n + (GSM_EXTENDED.includes(ch) ? 2 : 1), 0);

  const segments = length === 0 ? 0 : length <= limits.single ? 1 : Math.ceil(length / limits.multi);
  const capacity = segments <= 1 ? limits.single : segments * limits.multi;
  return {
    segments,
    length,
    encoding: unicode ? "UCS-2" : "GSM-7",
    remaining: Math.max(0, capacity - length),
  };
}

/**
 * Worst-case segment count for a template, measured with every `{{var}}`
 * expanded to a representative value. A template that fits one segment while
 * empty can bill as two once real names and amounts land in it, so the registry
 * shows this rather than the raw-body count.
 */
const SAMPLE_VAR_WIDTH = 12;
export function templateSegments(t: Pick<SmsTemplate, "content" | "smsType">): SegmentInfo {
  const filled = t.content.replace(
    /\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/g,
    "x".repeat(SAMPLE_VAR_WIDTH),
  );
  return smsSegments(filled, t.smsType);
}

/* --------------------------- Seed data --------------------------- */

/** Mirrored DLT templates for the demo workspace. */
export const SEED_SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: "1107168420993847112",
    name: "order_confirm_txn",
    smsType: "Text",
    category: "Transactional",
    peId: "1101473820000034521",
    senderId: "PICOMM",
    content:
      "Hi {{name}}, your order {{order_id}} of Rs {{amount}} is confirmed and will be delivered by {{eta}}. Track: {{link}} - PICOMM",
    createdAt: "12 Jun 2026",
  },
  {
    id: "1107168421004829376",
    name: "delivery_otp",
    smsType: "Text",
    category: "Transactional",
    peId: "1101473820000034521",
    senderId: "PICOTP",
    content: "{{otp}} is your verification code for PICOMM. Valid for 5 minutes. Do not share this code with anyone.",
    createdAt: "12 Jun 2026",
  },
  {
    id: "1107168421118290043",
    name: "renewal_reminder_promo",
    smsType: "Text",
    category: "Promotional",
    peId: "1101473820000034521",
    senderId: "PICOMM",
    content:
      "Hi {{name}}, your {{plan}} plan expires on {{expiry_date}}. Renew now and save {{discount}}%. Visit {{link}} to continue. - PICOMM",
    createdAt: "28 Jun 2026",
  },
  {
    id: "1107168421220847665",
    name: "payment_failed_txn",
    smsType: "Text",
    category: "Transactional",
    peId: "1101473820000034521",
    senderId: "PICOMM",
    content:
      "Payment of Rs {{amount}} for order {{order_id}} could not be processed. Retry at {{link}} or your order will be cancelled in {{hours}} hours. - PICOMM",
    createdAt: "02 Jul 2026",
  },
  {
    id: "1107168421339104782",
    name: "cart_recovery_promo",
    smsType: "Text",
    category: "Promotional",
    peId: "1101473820000034521",
    senderId: "PIOFFR",
    content: "{{name}}, you left {{item}} in your cart. Complete your order today and get {{discount}}% off. {{link}} - PICOMM",
    createdAt: "09 Jul 2026",
  },
  {
    id: "1107168421447290318",
    name: "festive_offer_hindi",
    smsType: "Unicode",
    category: "Promotional",
    peId: "1101473820000034521",
    senderId: "PIOFFR",
    content: "{{name}} जी, {{festival}} पर पाएं {{discount}}% की छूट। ऑफर {{expiry_date}} तक मान्य है। {{link}} - PICOMM",
    createdAt: "15 Jul 2026",
  },
  {
    id: "1107168421556731209",
    name: "kyc_pending_txn",
    smsType: "Text",
    category: "Transactional",
    peId: "1101473820000034521",
    senderId: "PICOMM",
    content: "Dear {{name}}, your KYC is pending verification. Complete it by {{due_date}} to keep your account active. {{link}} - PICOMM",
    createdAt: "21 Jul 2026",
  },
  {
    id: "1107168421663902554",
    name: "login_otp",
    smsType: "Text-class 0",
    category: "Transactional",
    peId: "1101473820000034521",
    senderId: "PICOTP",
    content: "{{otp}} is your PICOMM login OTP. Valid for {{minutes}} minutes. Never share it with anyone.",
    createdAt: "21 Jul 2026",
  },
];

/* --------------------------- Bulk upload --------------------------- */

/**
 * CSV headers for bulk template upload — the same seven fields as the single
 * create form, in form order, so a client who has configured one template by
 * hand recognises the columns immediately (PICOM-4726 §3).
 */
export const SMS_BULK_HEADERS = [
  "SMS Type",
  "PE ID",
  "Category",
  "Sender ID",
  "Template Name",
  "Template ID",
  "Message Content",
] as const;

/**
 * Hard cap on rows accepted per bulk CSV upload. Same ceiling the API's
 * batch register endpoint enforces, so bulk behaviour is symmetric across
 * the UI and API paths. Files above the cap are rejected whole; per-row
 * failures still work exactly as before under the cap.
 */
export const SMS_BULK_ROW_CAP = 500;

/** A parsed CSV row that failed validation, reported back with its line number. */
export type SmsBulkRowError = { row: number; errors: string[] };

export type SmsBulkResult = {
  /** Rows that passed every check and are ready to add to the registry. */
  valid: SmsTemplate[];
  /** Rows that failed, with per-row reasons. */
  invalid: SmsBulkRowError[];
  /** Header-level problem — when set, no rows were processed at all. */
  headerError?: string;
};

/**
 * Minimal RFC-4180 line splitter: handles quoted fields containing commas,
 * newlines and escaped quotes. Message bodies routinely contain commas, so a
 * naive `split(",")` corrupts real uploads.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  // Trailing field/row (file not ending in a newline).
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully blank lines — trailing newlines are normal in exported CSVs.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Validation shared by the single-template form and each bulk row. */
export function validateSmsTemplate(
  t: Partial<SmsTemplate>,
  existing: SmsTemplate[],
  /** Set when editing — that template's own ID doesn't count as a duplicate. */
  selfId?: string,
): string[] {
  const errors: string[] = [];
  if (!t.smsType) errors.push("SMS Type is required.");
  else if (!SMS_TYPES.includes(t.smsType)) errors.push(`SMS Type must be one of: ${SMS_TYPES.join(", ")}.`);

  if (!t.peId?.trim()) errors.push("PE ID is required.");
  else if (!/^\d{8,25}$/.test(t.peId.trim())) errors.push("PE ID must be 8-25 digits.");

  if (!t.category) errors.push("Category is required.");
  else if (!SMS_CATEGORIES.includes(t.category)) {
    errors.push(`Category must be one of: ${SMS_CATEGORIES.join(", ")}.`);
  }

  if (!t.senderId?.trim()) errors.push("Sender ID is required.");
  else if (!/^[A-Za-z0-9]{3,11}$/.test(t.senderId.trim())) {
    errors.push("Sender ID must be 3-11 letters or digits.");
  }

  if (!t.name?.trim()) errors.push("Template Name is required.");

  if (!t.id?.trim()) errors.push("Template ID is required.");
  else if (!/^\d{8,25}$/.test(t.id.trim())) errors.push("Template ID must be 8-25 digits.");
  else if (existing.some((x) => x.id === t.id!.trim() && x.id !== selfId)) {
    errors.push(`Template ID ${t.id.trim()} already exists in the registry.`);
  }

  if (!t.content?.trim()) errors.push("Message Content is required.");

  return errors;
}

/**
 * Parse + validate a bulk CSV against the registry. Rows are checked against
 * `existing` *and* against earlier rows in the same file, so a file that repeats
 * a Template ID reports the second occurrence rather than silently overwriting.
 */
export function parseSmsBulkCsv(text: string, existing: SmsTemplate[]): SmsBulkResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [], invalid: [], headerError: "The file is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const expected = SMS_BULK_HEADERS.map((h) => h.toLowerCase());
  const missing = expected.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      valid: [],
      invalid: [],
      headerError: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the sample CSV for the expected header row.`,
    };
  }

  const dataRowCount = rows.length - 1;
  if (dataRowCount > SMS_BULK_ROW_CAP) {
    return {
      valid: [],
      invalid: [],
      headerError: `This file has ${dataRowCount.toLocaleString()} rows. The upload limit is ${SMS_BULK_ROW_CAP} rows per file. Split the file and try again.`,
    };
  }

  // Index by name so column order in the uploaded file doesn't matter.
  const col = (name: (typeof SMS_BULK_HEADERS)[number]) => header.indexOf(name.toLowerCase());
  const idx = {
    smsType: col("SMS Type"),
    peId: col("PE ID"),
    category: col("Category"),
    senderId: col("Sender ID"),
    name: col("Template Name"),
    id: col("Template ID"),
    content: col("Message Content"),
  };

  const valid: SmsTemplate[] = [];
  const invalid: SmsBulkRowError[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const at = (i: number) => (cells[i] ?? "").trim();
    const candidate: Partial<SmsTemplate> = {
      smsType: at(idx.smsType) as SmsType,
      peId: at(idx.peId),
      category: at(idx.category) as SmsCategory,
      senderId: at(idx.senderId),
      name: at(idx.name),
      id: at(idx.id),
      // Content keeps its internal whitespace — only the field edges are trimmed.
      content: (cells[idx.content] ?? "").trim(),
    };
    // Later rows must not collide with earlier accepted ones in the same file.
    const errors = validateSmsTemplate(candidate, [...existing, ...valid]);
    if (errors.length > 0) invalid.push({ row: r + 1, errors });
    else valid.push({ ...(candidate as SmsTemplate), createdAt: todayLabel() });
  }

  return { valid, invalid };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today as "22 Jul 2026" — the registry's display format. */
export function todayLabel(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "22 Jul 2026" → Date (local midnight), for date-range filtering. */
export function parseSmsCreated(s: string): Date {
  const [d, mon, y] = s.split(" ");
  return new Date(Number(y), Math.max(0, MONTHS.indexOf(mon)), Number(d));
}

/** A ready-to-fill sample CSV: the header row plus one illustrative template. */
export function sampleBulkCsv(): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const example = [
    "Text",
    "1101473820000034521",
    "Transactional",
    "PICOMM",
    "order_confirm_txn",
    "1107168420993847112",
    "Hi {{name}}, your order {{order_id}} of Rs {{amount}} is confirmed. Track: {{link}} - PICOMM",
  ];
  return `${SMS_BULK_HEADERS.join(",")}\n${example.map(escape).join(",")}\n`;
}

/** Trigger a client-side download of `content` as `filename`. */
export function downloadCsvFile(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
