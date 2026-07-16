import Anthropic from "@anthropic-ai/sdk";
import type { CartMetrics } from "@/lib/types";

const SYSTEM_PROMPT = `You narrate abandoned-cart numbers for a Shopify store owner in exactly one natural, conversational sentence.

Rules:
- State the cart count, the total dollar value, and the time window from the data given.
- End by asking if they want you to send recovery messages.
- One sentence only. No preamble, no markdown, no emoji, no quotation marks around the sentence.
- Use only the numbers provided. Never invent or round in a way that changes the reported value.`;

function fallbackSentence(metrics: CartMetrics): string {
  const value = metrics.totalValue.toLocaleString("en-US", {
    style: "currency",
    currency: metrics.currency || "USD",
    maximumFractionDigits: 0,
  });
  return `Found ${metrics.count} abandoned carts worth ${value} in the last ${metrics.windowDays} days — want me to send recovery messages?`;
}

export async function POST(request: Request) {
  const { metrics } = (await request.json()) as { metrics: CartMetrics };

  if (!metrics || typeof metrics.count !== "number") {
    return Response.json({ error: "Missing metrics" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ sentence: fallbackSentence(metrics), source: "fallback" });
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 200,
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            abandoned_cart_count: metrics.count,
            total_value: metrics.totalValue,
            currency: metrics.currency,
            window_days: metrics.windowDays,
            oldest_cart_age_days: metrics.oldestAgeDays,
          }),
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const sentence = textBlock?.text?.trim();

    if (!sentence) throw new Error("Empty response from Claude");

    return Response.json({ sentence, source: "claude" });
  } catch {
    return Response.json({ sentence: fallbackSentence(metrics), source: "fallback" });
  }
}
