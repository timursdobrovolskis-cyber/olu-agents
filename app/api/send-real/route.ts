import Anthropic from "@anthropic-ai/sdk";
import { sendRecoveryEmail } from "@/lib/email";
import type { ShopifyCheckout } from "@/lib/types";

interface RecoveryMessage {
  subject: string;
  body: string;
}

const SYSTEM_PROMPT = `You write one example cart-recovery email for a Shopify store owner to preview, based on abandoned-cart data.

Rules:
- Output strictly as JSON: {"subject": "...", "body": "..."}
- No markdown, no code fences, no text outside the JSON object.
- subject: short, friendly, under 60 characters, no emoji.
- body: 2-3 short sentences, warm and human (not salesy), mentions their cart is still saved, references the item(s) by name if given, includes a light nudge like a small perk or simple reminder, and a call to action to complete checkout. No emoji, no placeholder brackets like [Customer Name] — write it addressed generically to "there".`;

function fallbackMessage(checkout: ShopifyCheckout): RecoveryMessage {
  const firstItem = checkout.line_items[0]?.title;
  return {
    subject: "You left something in your cart",
    body: firstItem
      ? `Hi there — your ${firstItem} is still saved and ready whenever you are. If anything's holding you back, just reply and we'll help out. Complete your order in the next 24 hours and we'll cover shipping.`
      : "Hi there — your cart is still saved and ready whenever you are. If anything's holding you back, just reply and we'll help out. Complete your order in the next 24 hours and we'll cover shipping.",
  };
}

async function generateMessage(checkout: ShopifyCheckout): Promise<RecoveryMessage> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackMessage(checkout);

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
            total_value: checkout.total_price,
            currency: checkout.currency,
            items: checkout.line_items.map((i) => `${i.quantity}x ${i.title}`),
          }),
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock?.text) {
      const parsed = JSON.parse(textBlock.text.trim());
      if (parsed.subject && parsed.body) return { subject: parsed.subject, body: parsed.body };
    }
  } catch {
    // fall through to fallback message
  }

  return fallbackMessage(checkout);
}

export async function POST(request: Request) {
  const { to, checkout } = (await request.json()) as { to: string; checkout: ShopifyCheckout };

  if (!to || !checkout) {
    return Response.json({ error: "Missing recipient or checkout" }, { status: 400 });
  }

  const message = await generateMessage(checkout);
  const result = await sendRecoveryEmail({ to, subject: message.subject, body: message.body });

  return Response.json({
    sent: result.sent,
    reason: result.reason,
    subject: message.subject,
    body: message.body,
    to,
  });
}
