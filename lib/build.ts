/**
 * Act two: importing the business's data, building the automation skeleton,
 * and talking to the agent about it.
 *
 * The pitch path is Fashion & Apparel > Cart abandonment > One-off purchase,
 * which routes to `recovery` — that skeleton is the detailed one. The other
 * two are real but lighter, so a misclick on stage still shows something
 * coherent rather than an empty panel.
 */

export type StepKind =
  | "trigger"
  | "guard"
  | "fetch"
  | "compose"
  | "dispatch"
  | "follow"
  | "stop";

export interface BuildStep {
  kind: StepKind;
  title: string;
  detail: string;
}

/** A file the business dropped in. Never uploaded — read locally for display. */
export interface ImportedFile {
  name: string;
  size: number;
  kind: string;
}

export interface ChatTurn {
  id: string;
  role: "user" | "agent";
  content: string;
}

/** POST /api/build request. */
export interface BuildRequest {
  automationId: string;
  files: { name: string; size: number; kind: string }[];
}

/** POST /api/build response. */
export interface BuildResponse {
  steps: BuildStep[];
}

/** A bespoke automation invented for an answer we don't have a build for. */
export interface GeneratedAutomation {
  id: string;
  code: string;
  name: string;
  blurb: string;
}

/** POST /api/generate request — sent when the user answers "Something else". */
export interface GenerateRequest {
  field: string;
  problems: string[];
  product?: string;
  /** The free text they actually typed. This is the whole point of the call. */
  customText: string;
}

/** POST /api/generate response. */
export interface GenerateResponse {
  automation: GeneratedAutomation;
  steps: BuildStep[];
}

export function isGenerateResponse(v: unknown): v is GenerateResponse {
  const r = v as GenerateResponse;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof r.automation?.name === "string" &&
    typeof r.automation?.code === "string" &&
    Array.isArray(r.steps) &&
    r.steps.length > 0
  );
}

/** POST /api/chat request — scoped to the automation just built. */
export interface ChatRequest {
  automationId: string;
  message: string;
  history: { role: "user" | "agent"; content: string }[];
}

/** POST /api/chat response. */
export interface ChatResponse {
  reply: string;
}

export function isBuildResponse(v: unknown): v is BuildResponse {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as BuildResponse).steps) &&
    (v as BuildResponse).steps.every((s) => typeof s?.title === "string")
  );
}

export function isChatResponse(v: unknown): v is ChatResponse {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as ChatResponse).reply === "string"
  );
}

const SKELETONS: Record<string, BuildStep[]> = {
  recovery: [
    {
      kind: "trigger",
      title: "Checkout abandoned",
      detail: "Shopify webhook — cart idle for 60 minutes",
    },
    {
      kind: "guard",
      title: "Contactable & consented",
      detail: "Has email, marketing consent true, not unsubscribed",
    },
    {
      kind: "fetch",
      title: "Read cart & history",
      detail: "Line items, value, currency, prior orders",
    },
    {
      kind: "compose",
      title: "Write the recovery message",
      detail: "Claude drafts subject + body from the cart's own contents",
    },
    {
      kind: "dispatch",
      title: "Send & log",
      detail: "Resend delivers, outcome written to the ledger",
    },
    {
      kind: "follow",
      title: "Second nudge",
      detail: "If unopened after 24h, one follow-up — then stop",
    },
    {
      kind: "stop",
      title: "Exit conditions",
      detail: "Purchase completed, unsubscribe, or 72h elapsed",
    },
  ],
  concierge: [
    {
      kind: "trigger",
      title: "Enquiry received",
      detail: "New message on email, chat, or contact form",
    },
    {
      kind: "fetch",
      title: "Pull context",
      detail: "Customer, order status, prior thread",
    },
    {
      kind: "compose",
      title: "Draft the reply",
      detail: "Claude answers in your voice, cites real order data",
    },
    {
      kind: "dispatch",
      title: "Send or escalate",
      detail: "Auto-send routine replies; hand off anything unusual",
    },
    {
      kind: "follow",
      title: "Chase the silence",
      detail: "No reply in 48h — one polite follow-up",
    },
  ],
  forecast: [
    {
      kind: "trigger",
      title: "Weekly roll-up",
      detail: "Every Monday 07:00, on last 90 days of orders",
    },
    {
      kind: "fetch",
      title: "Read the numbers",
      detail: "Orders, refunds, traffic, stock on hand",
    },
    {
      kind: "compose",
      title: "Project and explain",
      detail: "Claude forecasts next month and says what moved it",
    },
    {
      kind: "dispatch",
      title: "Deliver the brief",
      detail: "One email, three numbers, one recommendation",
    },
  ],
};

export function skeletonFor(automationId: string): BuildStep[] {
  return SKELETONS[automationId] ?? SKELETONS.recovery;
}

export const STEP_LABEL: Record<StepKind, string> = {
  trigger: "Trigger",
  guard: "Guard",
  fetch: "Fetch",
  compose: "Compose",
  dispatch: "Dispatch",
  follow: "Follow-up",
  stop: "Stop",
};

/**
 * Local stand-in for /api/generate.
 *
 * It deliberately does NOT try to name the automation from their text. Naming
 * free text is a language-model job: slicing words out of "customers never
 * leave reviews after buying" yields "Never Leave Agent", which is worse than
 * saying nothing at 48px in front of a room. So the fallback stays neutral and
 * lets their own words carry the meaning in the blurb; /api/generate does the
 * naming properly when it exists.
 */
export function mockGenerate(req: GenerateRequest): GenerateResponse {
  const text = req.customText.trim();
  return {
    automation: {
      id: "custom",
      code: "A/0X",
      name: "Custom Build",
      blurb: `Written for what you told us: "${text}". Same spine as the others — watch, decide, act — wired to your case instead of a template.`,
    },
    steps: [
      {
        kind: "trigger",
        title: "Watch for the moment",
        detail: `Fires on the event behind "${text}"`,
      },
      {
        kind: "fetch",
        title: "Pull the context",
        detail: "Customer, order history, and whatever you imported",
      },
      {
        kind: "compose",
        title: "Decide what to do",
        detail: "Claude reads the situation and drafts the response",
      },
      {
        kind: "dispatch",
        title: "Act & log",
        detail: "Sends, records the outcome, learns from the reply",
      },
      {
        kind: "stop",
        title: "Exit conditions",
        detail: "Resolved, opted out, or 72h elapsed",
      },
    ],
  };
}

let seq = 0;
export function turnId(): string {
  seq += 1;
  return `t${seq}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Canned answers used only when /api/chat is unreachable, so the pitch's last
 * beat never dead-ends. Keyword-matched, deliberately short.
 */
export function mockReply(message: string, automationName: string): string {
  const m = message.toLowerCase();

  if (/when|how (soon|long)|time|hour/.test(m)) {
    return "It fires 60 minutes after the cart goes idle — long enough that they haven't just stepped away, early enough that they still remember what they wanted.";
  }
  if (/change|edit|adjust|instead|different/.test(m)) {
    return "Tell me which step and what it should do instead. I'll rewrite that node and leave the rest of the skeleton intact.";
  }
  if (/data|file|csv|import|upload/.test(m)) {
    return "I read the columns you imported and mapped them to the cart fields. Anything I couldn't match, I left out rather than guessed at.";
  }
  if (/spam|unsubscribe|annoy|too many/.test(m)) {
    return "Two messages maximum, then it stops. Purchase or unsubscribe ends the sequence immediately — that's the Stop node.";
  }
  if (/cost|price|much/.test(m)) {
    return "Roughly a fifth of a cent per recovery email in model cost. The email itself is whatever your sending provider charges.";
  }
  if (/live|deploy|ship|launch|real/.test(m)) {
    return `${automationName} runs against your paper store first. When the numbers hold for a week, you flip one flag and it's live.`;
  }
  return `That's outside what I've built so far — but the skeleton for ${automationName} is a starting point, not a finished thing. Tell me what it's missing.`;
}
