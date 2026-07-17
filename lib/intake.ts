/**
 * The intake questionnaire, its routing model, and the /api/recommend contract.
 *
 * The flow is data, not code: QUESTIONS drives the whole UI. Add an option or a
 * question here and the screen follows.
 */

export type IconName =
  | "fashion"
  | "electronics"
  | "beauty"
  | "digital"
  | "leads"
  | "gigs"
  | "abandonment"
  | "comms"
  | "forecast"
  | "box"
  | "repeat"
  | "premium"
  | "other";

export type ProblemId = "leads" | "gigs" | "abandonment" | "comms" | "forecast";
export type QuestionId = "field" | "problems" | "product";

export interface Option {
  id: string;
  label: string;
  /** One-line clarifier under the label. */
  note: string;
  icon: IconName;
}

export interface Question {
  id: QuestionId;
  /** Asked in the agent's voice. */
  prompt: string;
  kind: "single" | "multi";
  options: Option[];
  /** Free-text escape hatch, always offered. */
  otherLabel: string;
  /** Omitted questions are skipped; see shouldAsk(). */
  showIf?: (a: Answers) => boolean;
}

export interface Answer {
  selected: string[];
  other?: string;
}

export type Answers = Partial<Record<QuestionId, Answer>>;

/* ==========================================================================
   THE THREE AUTOMATIONS — replace these with the real builds.
   `weights` maps a problem to how much this automation relieves it (0-3).
   Routing is driven entirely by this table; renaming is safe.

   Declaration order is the tie-break: on an equal score the earlier entry
   wins, so list them most-generally-applicable first.
   ========================================================================== */
export interface Automation {
  id: string;
  /** Gate-style code, shown as the headline numeral. */
  code: string;
  name: string;
  /** What it does, in the pitch's voice. */
  blurb: string;
  weights: Record<ProblemId, number>;
}

export const AUTOMATIONS: Automation[] = [
  {
    id: "recovery",
    code: "A/01",
    name: "Cart Recovery",
    blurb:
      "Watches for abandoned checkouts and writes each customer a personal reason to come back — automatically, within the hour.",
    // gigs is deliberately level with Concierge: "not enough work" is fixed by
    // recovering lost checkouts in a shop but by converting enquiries in a
    // service business, so FIELD_BONUS decides rather than this table.
    weights: { leads: 3, gigs: 2, abandonment: 3, comms: 1, forecast: 0 },
  },
  {
    id: "concierge",
    code: "A/02",
    name: "Client Concierge",
    blurb:
      "Answers customer questions, chases replies, and keeps every conversation moving without anyone on your side typing.",
    weights: { leads: 1, gigs: 2, abandonment: 1, comms: 3, forecast: 0 },
  },
  {
    id: "forecast",
    code: "A/03",
    name: "Forecast Desk",
    blurb:
      "Projects next month's sales from your own history and reports what moved, what stalled, and what to do about it.",
    weights: { leads: 0, gigs: 0, abandonment: 0, comms: 0, forecast: 3 },
  },
];

/** Nudges applied on top of problem weights, keyed by product kind. */
const PRODUCT_BONUS: Record<string, Partial<Record<string, number>>> = {
  oneoff: { recovery: 1 },
  subscription: { forecast: 1 },
  premium: { concierge: 1 },
};

/** Service-led businesses lean on conversation over checkout mechanics. */
const FIELD_BONUS: Record<string, Partial<Record<string, number>>> = {
  digital: { concierge: 1 },
};

export const QUESTIONS: Question[] = [
  {
    id: "field",
    prompt: "What do you sell?",
    kind: "single",
    otherLabel: "Something else",
    options: [
      {
        id: "fashion",
        label: "Fashion & Apparel",
        note: "Clothing, footwear, accessories",
        icon: "fashion",
      },
      {
        id: "electronics",
        label: "Electronics & Tech",
        note: "Devices, gadgets, gear",
        icon: "electronics",
      },
      {
        id: "beauty",
        label: "Beauty & Cosmetics",
        note: "Skincare, makeup, fragrance",
        icon: "beauty",
      },
      {
        id: "digital",
        label: "Digital & Services",
        note: "Courses, software, bookings",
        icon: "digital",
      },
    ],
  },
  {
    id: "problems",
    prompt: "What's hurting? Pick everything that applies.",
    kind: "multi",
    otherLabel: "Something else",
    options: [
      {
        id: "leads",
        label: "Leads",
        note: "Visitors arrive but don't buy",
        icon: "leads",
      },
      {
        id: "gigs",
        label: "Too few gigs",
        note: "Not enough work coming in",
        icon: "gigs",
      },
      {
        id: "abandonment",
        label: "Cart abandonment",
        note: "They reach checkout, then vanish",
        icon: "abandonment",
      },
      {
        id: "comms",
        label: "Slow client replies",
        note: "Conversations go cold",
        icon: "comms",
      },
      {
        id: "forecast",
        label: "Flying blind",
        note: "No forecast, no read on progress",
        icon: "forecast",
      },
    ],
  },
  {
    id: "product",
    // Only asked when they sell a product; services skip it.
    showIf: (a) => a.field?.selected[0] !== "digital",
    prompt: "And how do people buy it?",
    kind: "single",
    otherLabel: "Something else",
    options: [
      {
        id: "oneoff",
        label: "One-off purchase",
        note: "Bought once, now and then",
        icon: "box",
      },
      {
        id: "subscription",
        label: "Subscription / refill",
        note: "Recurring or replenishable",
        icon: "repeat",
      },
      {
        id: "premium",
        label: "High-ticket",
        note: "Considered, researched, expensive",
        icon: "premium",
      },
    ],
  },
];

export function shouldAsk(q: Question, a: Answers): boolean {
  return q.showIf ? q.showIf(a) : true;
}

export function visibleQuestions(a: Answers): Question[] {
  return QUESTIONS.filter((q) => shouldAsk(q, a));
}

export function isAnswered(q: Question, a: Answers): boolean {
  const ans = a[q.id];
  if (!ans) return false;
  if (ans.selected.includes("other")) return Boolean(ans.other?.trim());
  return ans.selected.length > 0;
}

/** Human-readable form of an answer, for the transcript and the API payload. */
export function describeAnswer(q: Question, ans: Answer): string {
  const labels = ans.selected
    .filter((id) => id !== "other")
    .map((id) => q.options.find((o) => o.id === id)?.label ?? id);
  if (ans.selected.includes("other") && ans.other?.trim()) {
    labels.push(ans.other.trim());
  }
  return labels.join(", ") || "—";
}

/* ==========================================================================
   ROUTING — used as the local fallback when /api/recommend is unavailable.
   The backend owns the real decision; this keeps the demo standalone.
   ========================================================================== */
export interface Verdict {
  automationId: string;
  score: number;
  reason: string;
}

export interface Recommendation {
  chosen: Verdict;
  /** The automations that lost, with why — ordered by score. */
  ruledOut: Verdict[];
  email?: EmailPreview;
}

export interface EmailPreview {
  to: string;
  subject: string;
  body: string;
  status: "sent" | "queued" | "failed";
}

/** POST /api/recommend request body. */
export interface RecommendRequest {
  field: { id: string; label: string };
  problems: { id: string; label: string }[];
  product?: { id: string; label: string };
}

export type RecommendResponse = Recommendation;

export function isRecommendation(v: unknown): v is Recommendation {
  const r = v as Recommendation;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof r.chosen?.automationId === "string" &&
    Array.isArray(r.ruledOut)
  );
}

export function automationById(id: string): Automation | undefined {
  return AUTOMATIONS.find((a) => a.id === id);
}

export function scoreAutomations(a: Answers): Recommendation {
  const problems = (a.problems?.selected ?? []).filter(
    (p): p is ProblemId => p !== "other",
  );
  const productId = a.product?.selected[0];
  const fieldId = a.field?.selected[0];

  const scored = AUTOMATIONS.map((auto) => {
    const base = problems.reduce((sum, p) => sum + (auto.weights[p] ?? 0), 0);
    const bonus =
      (productId ? (PRODUCT_BONUS[productId]?.[auto.id] ?? 0) : 0) +
      (fieldId ? (FIELD_BONUS[fieldId]?.[auto.id] ?? 0) : 0);
    return { auto, score: base + bonus };
  }).sort((x, y) => y.score - x.score);

  const problemLabels = problems.map(
    (p) => QUESTIONS[1].options.find((o) => o.id === p)?.label.toLowerCase() ?? p,
  );

  const toVerdict = (
    entry: { auto: Automation; score: number },
    won: boolean,
  ): Verdict => ({
    automationId: entry.auto.id,
    score: entry.score,
    reason: won
      ? problemLabels.length
        ? `Scores highest against ${problemLabels.join(" and ")}.`
        : "Broadest fit for a store at this stage."
      : entry.score > 0
        ? "Helps, but relieves less of what you named."
        : "Doesn't address anything you flagged.",
  });

  return {
    chosen: toVerdict(scored[0], true),
    ruledOut: scored.slice(1).map((e) => toVerdict(e, false)),
  };
}

/**
 * Local stand-in used only when /api/recommend is unreachable, so the flow is
 * demonstrable before the backend lands.
 */
export function mockRecommendation(a: Answers): Recommendation {
  const rec = scoreAutomations(a);
  const auto = automationById(rec.chosen.automationId);
  return {
    ...rec,
    email: {
      to: "you@yourstore.com",
      subject: `Your automation plan — ${auto?.name ?? "recommended build"}`,
      status: "sent",
      body: `Based on your answers we'd build ${auto?.name} (${auto?.code}) first.\n\n${auto?.blurb}\n\nReply to this email and we'll scope it.`,
    },
  };
}
