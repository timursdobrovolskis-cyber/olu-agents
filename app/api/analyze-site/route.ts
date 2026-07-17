import Anthropic from "@anthropic-ai/sdk";

interface SiteSignals {
  title: string;
  description: string;
  platform: string;
  products: string[];
  prices: string[];
  text: string;
}

interface AnalyzeResult {
  store: {
    url: string;
    title: string;
    platform: string;
    sells: string[];
  };
  summary: string;
  recommendation: { automationId: "recovery"; name: string; reason: string };
  source: "claude" | "scripted";
  concerns: string;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function detectPlatform(html: string): string {
  const h = html.toLowerCase();
  if (h.includes("cdn.shopify") || h.includes("myshopify.com") || h.includes("shopify.theme"))
    return "Shopify";
  if (h.includes("woocommerce") || h.includes("wp-content")) return "WooCommerce";
  if (h.includes("bigcommerce")) return "BigCommerce";
  if (h.includes("squarespace")) return "Squarespace";
  if (h.includes("wix.com") || h.includes("wixstatic")) return "Wix";
  return "Unknown";
}

function extractSignals(html: string): SiteSignals {
  const title =
    decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 120)) ||
    "Untitled store";

  const description = decode(
    (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      "").slice(0, 300)
  );

  const platform = detectPlatform(html);

  // Product names from JSON-LD Product blocks.
  const products: string[] = [];
  const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ld) {
    const names = block.match(/"name"\s*:\s*"([^"]{2,80})"/g) ?? [];
    for (const n of names) {
      const v = decode(n.replace(/.*"name"\s*:\s*"/, "").replace(/"$/, ""));
      if (v && !products.includes(v) && v.toLowerCase() !== title.toLowerCase()) products.push(v);
    }
  }

  const prices = Array.from(
    new Set((html.match(/[$£€]\s?\d{1,4}(?:[.,]\d{2})?/g) ?? []).slice(0, 8))
  );

  const text = decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).slice(0, 2500);

  return { title, description, platform, products: products.slice(0, 8), prices, text };
}

const SYSTEM_PROMPT = `You are a sharp e-commerce analyst reviewing a store from its website content.
From the provided page signals, infer: what kind of store it is and roughly what it sells, and what platform it likely runs on.
Then recommend ONE automation: Cart Recovery — and give a concrete, confident reason it fits this specific store.
Write like a person who knows e-commerce. 2-3 sentences for the summary, 1 sentence for the reason. No hedging, no disclaimers, no "as an AI".
Output strictly JSON: {"summary":"...","reason":"..."}. No markdown, no code fences.`;

function scriptedAnalysis(s: SiteSignals, concerns: string): { summary: string; reason: string } {
  const kind = s.products.length
    ? `a ${s.platform !== "Unknown" ? s.platform + " " : ""}store selling ${s.products.slice(0, 3).join(", ")}`
    : s.description
      ? `a ${s.platform !== "Unknown" ? s.platform + " " : ""}store — ${s.description.slice(0, 120)}`
      : `a ${s.platform !== "Unknown" ? s.platform + " " : "an online"} store`;

  const priceNote = s.prices.length ? ` Typical prices land around ${s.prices[0]}.` : "";
  const concernNote = concerns.trim()
    ? ` You flagged: "${concerns.trim().slice(0, 100)}" — cart recovery directly attacks that leak.`
    : "";

  return {
    summary: `${s.title} looks like ${kind}.${priceNote} It has the classic shape of a store losing revenue at checkout rather than at the top of the funnel.`,
    reason: `Around 70% of e-commerce carts are abandoned — recovering even a slice of those is the fastest dollar win for a store like this.${concernNote}`,
  };
}

export async function POST(request: Request) {
  const { url, concerns = "" } = (await request.json()) as { url: string; concerns?: string };

  if (!url || !/^https?:\/\//i.test(url)) {
    return Response.json({ error: "Enter a full URL starting with http(s)://" }, { status: 400 });
  }

  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OluBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Site returned ${res.status}`);
    html = await res.text();
  } catch {
    return Response.json(
      { error: "Couldn't read that site — mind filling in a few details instead?" },
      { status: 502 }
    );
  }

  const signals = extractSignals(html);

  let analysis = scriptedAnalysis(signals, concerns);
  let source: "claude" | "scripted" = "scripted";

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 400,
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              title: signals.title,
              description: signals.description,
              platform: signals.platform,
              products: signals.products,
              prices: signals.prices,
              page_text: signals.text.slice(0, 1500),
              owner_concerns: concerns,
            }),
          },
        ],
      });
      const block = response.content.find((b) => b.type === "text");
      if (block?.text) {
        const parsed = JSON.parse(block.text.trim());
        if (parsed.summary && parsed.reason) {
          analysis = { summary: parsed.summary, reason: parsed.reason };
          source = "claude";
        }
      }
    } catch {
      // keep scripted analysis
    }
  }

  const result: AnalyzeResult = {
    store: {
      url,
      title: signals.title,
      platform: signals.platform,
      sells: signals.products,
    },
    summary: analysis.summary,
    recommendation: {
      automationId: "recovery",
      name: "Cart Recovery",
      reason: analysis.reason,
    },
    source,
    concerns,
  };

  return Response.json(result);
}
