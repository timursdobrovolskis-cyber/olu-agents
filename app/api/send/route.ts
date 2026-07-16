import Anthropic from "@anthropic-ai/sdk";
import type { CartMetrics } from "@/lib/types";

interface RecoveryMessage {
  subject: string;
  body: string;
}

const SYSTEM_PROMPT = `You write one example cart-recovery email for a Shopify store owner to preview, based on abandoned-cart data.

Rules:
- Output strictly as JSON: {"subject": "...", "body": "..."}
- No markdown, no code fences, no text outside the JSON object.
- subject: short, friendly, under 60 characters, no emoji.
- body: 2-3 short sentences, warm and human (not salesy), mentions their cart is still saved, includes a light nudge like a small perk or simple reminder, and a call to action to complete checkout. No emoji, no placeholder brackets like [Customer Name] — write it addressed generically to "there".`;

function fallbackMessage(): RecoveryMessage {
  return {
    subject: "You left something in your cart",
    body: "Hi there — your cart is still saved and ready whenever you are. If anything's holding you back, just reply to this email and we'll help out. Complete your order in the next 24 hours and we'll cover shipping.",
  };
}

export async function POST(request: Request) {
  const { metrics } = (await request.json()) as { metrics: CartMetrics };

  if (!metrics || typeof metrics.count !== "number") {
    return Response.json({ error: "Missing metrics" }, { status: 400 });
  }

  let exampleMessage = fallbackMessage();

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 300,
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              abandoned_cart_count: metrics.count,
              total_value: metrics.totalValue,
              currency: metrics.currency,
            }),
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock?.text) {
        const parsed = JSON.parse(textBlock.text.trim());
        if (parsed.subject && parsed.body) {
          exampleMessage = { subject: parsed.subject, body: parsed.body };
        }
      }
    } catch {
      // keep fallback message
    }
  }

  // No real send happens — this is a demo confirmation only.
  return Response.json({
    confirmation: `Sent to ${metrics.count} customer${metrics.count === 1 ? "" : "s"}`,
    exampleMessage,
  });
}
