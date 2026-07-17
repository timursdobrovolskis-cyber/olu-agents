import Anthropic from "@anthropic-ai/sdk";
import { fetchAbandonedCheckouts } from "@/lib/shopify";
import { generateMockCheckouts } from "@/lib/mockData";
import type { ShopifyCheckout } from "@/lib/types";

// Never fail on stage: if Shopify is unreachable (bad wifi) or empty,
// fall back to sample carts so the demo always plays through.
async function resilientCheckouts(): Promise<{
  checkouts: ShopifyCheckout[];
  source: "shopify" | "mock";
}> {
  try {
    const { checkouts, source } = await fetchAbandonedCheckouts();
    if (checkouts.length > 0) return { checkouts, source };
  } catch {
    // network / Shopify error — fall through to mock
  }
  return { checkouts: generateMockCheckouts(), source: "mock" };
}

interface RunResult {
  cart: {
    email: string;
    items: string;
    value: string;
    currency: string;
    ageLabel: string;
    source: "shopify" | "mock";
  };
  email: { subject: string; body: string };
  status: "sent";
}

function ageLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hrs = Math.max(1, Math.round(ms / 3_600_000));
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const SYSTEM_PROMPT = `You write one cart-recovery email a Shopify store would send.
Output strictly JSON: {"subject":"...","body":"..."}. No markdown, no fences.
subject: under 55 chars, friendly, no emoji.
body: 2-3 warm human sentences (not salesy), name the item(s), a light nudge, a call to finish checkout, addressed to "there". No emoji, no [brackets].`;

function fallbackEmail(c: ShopifyCheckout): { subject: string; body: string } {
  const item = c.line_items[0]?.title ?? "your pick";
  return {
    subject: `Still thinking about the ${item}?`,
    body: `Hi there — your ${item} is still saved in your cart. If anything held you up, just reply and we'll help. Finish checkout in the next 24 hours and shipping's on us.`,
  };
}

async function compose(c: ShopifyCheckout): Promise<{ subject: string; body: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackEmail(c);
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 300,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            items: c.line_items.map((l) => `${l.quantity}x ${l.title}`),
            value: c.total_price,
            currency: c.currency,
          }),
        },
      ],
    });
    const block = res.content.find((b) => b.type === "text");
    if (block?.text) {
      const parsed = JSON.parse(block.text.trim());
      if (parsed.subject && parsed.body) return { subject: parsed.subject, body: parsed.body };
    }
  } catch {
    // fall through
  }
  return fallbackEmail(c);
}

export async function GET() {
  try {
    const { checkouts, source } = await resilientCheckouts();

    // Pick the highest-value cart — the most compelling one to show.
    const cart = [...checkouts].sort(
      (a, b) => parseFloat(b.total_price) - parseFloat(a.total_price)
    )[0];

    const email = await compose(cart);

    const result: RunResult = {
      cart: {
        email: cart.email || "shopper@email.com",
        items: cart.line_items.map((l) => `${l.quantity}× ${l.title}`).join(", "),
        value: parseFloat(cart.total_price).toLocaleString("en-US", {
          style: "currency",
          currency: cart.currency || "USD",
          maximumFractionDigits: 0,
        }),
        currency: cart.currency || "USD",
        ageLabel: ageLabel(cart.created_at),
        source,
      },
      email,
      status: "sent",
    };

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
