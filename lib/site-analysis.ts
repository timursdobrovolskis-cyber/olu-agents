import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 10_000;

export interface SiteSignals {
  title: string;
  description: string;
  platform: string;
  category: string;
  products: string[];
  prices: string[];
  priceSignal: string;
  text: string;
}

export interface SiteEvidence {
  label: string;
  value: string;
}

export interface SiteAnalysisResult {
  store: {
    url: string;
    title: string;
    description: string;
    platform: string;
    category: string;
    sells: string[];
    priceSignal: string;
  };
  evidence: SiteEvidence[];
  summary: string;
  recommendation: {
    automationId: "recovery";
    name: "Cart Recovery";
    reason: string;
  };
  source: "ai" | "signals";
  concerns: string;
}

export class SiteAnalysisError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "SiteAnalysisError";
    this.status = status;
  }
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value
    .replace(/&(#x?[\da-f]+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
      const hex = code[1]?.toLowerCase() === "x";
      const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(number) && number >= 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkup(value: string): string {
  return decodeEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function attribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function metaContent(html: string, keys: string[]): string {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const key = (attribute(tag, "name") || attribute(tag, "property")).toLowerCase();
    if (wanted.has(key)) return attribute(tag, "content");
  }

  return "";
}

function addUnique(target: string[], value: unknown, limit: number): void {
  if (typeof value !== "string" && typeof value !== "number") return;
  const cleaned = stripMarkup(String(value)).replace(/^[|\-–—:]+|[|\-–—:]+$/g, "").trim();
  if (cleaned.length < 2 || cleaned.length > 100) return;
  if (!target.some((item) => item.toLowerCase() === cleaned.toLowerCase()) && target.length < limit) {
    target.push(cleaned);
  }
}

function detectPlatform(html: string): string {
  const source = html.toLowerCase();
  const signatures: Array<[string, string[]]> = [
    ["Shopify", ["cdn.shopify.com", "/cdn/shop/", "shopify.theme", "shopify-section"]],
    ["WooCommerce", ["woocommerce", "wc-ajax", "wp-content/plugins/woocommerce"]],
    ["BigCommerce", ["bigcommerce.com", "stencil-utils", "cdn11.bigcommerce"]],
    ["Squarespace", ["static.squarespace.com", "squarespace.com"]],
    ["Wix", ["wixstatic.com", "wix.com/website/templates"]],
    ["Adobe Commerce", ["magento_", "x-magento", "mage/cookies"]],
    ["PrestaShop", ["prestashop", "var prestashop"]],
    ["Shopware", ["shopware", "sw-cms-"]],
    ["Webflow", ["webflow.js", "website-files.com"]],
  ];

  return signatures.find(([, markers]) => markers.some((marker) => source.includes(marker)))?.[0] ??
    "Unknown";
}

function typeNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function collectOfferPrices(value: unknown, prices: string[]): void {
  const offers = Array.isArray(value) ? value : [value];
  const symbols: Record<string, string> = { AUD: "A$", CAD: "C$", EUR: "€", GBP: "£", USD: "$" };

  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const record = offer as Record<string, unknown>;
    const amount = record.price ?? record.lowPrice;
    if (typeof amount !== "string" && typeof amount !== "number") continue;
    const currency = typeof record.priceCurrency === "string" ? record.priceCurrency.toUpperCase() : "";
    addUnique(prices, `${symbols[currency] ?? (currency ? `${currency} ` : "")}${amount}`, 12);
  }
}

function collectStructuredData(html: string, products: string[], prices: string[]): void {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    const types = typeNames(record["@type"]).map((type) => type.toLowerCase());
    if (types.includes("product")) {
      addUnique(products, record.name, 12);
      collectOfferPrices(record.offers, prices);
    }

    Object.values(record).forEach(visit);
  };

  for (const script of scripts) {
    if (attribute(script.slice(0, script.indexOf(">") + 1), "type").toLowerCase() !== "application/ld+json") {
      continue;
    }

    const json = script
      .replace(/^<script\b[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .replace(/^\s*<!--|-->\s*$/g, "")
      .trim();
    if (!json) continue;

    try {
      visit(JSON.parse(json));
    } catch {
      // A surprising number of storefronts ship malformed JSON-LD. Other
      // storefront signals still give us a useful analysis.
    }
  }
}

function collectProductLinks(html: string, products: string[]): void {
  const links = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const generic = /^(buy now|details|learn more|quick view|shop now|view|view all|view product)$/i;

  for (const link of links) {
    const openingTag = link.slice(0, link.indexOf(">") + 1);
    const href = attribute(openingTag, "href");
    if (
      !/(?:\/products?\/|\/collections\/[^/]+\/products\/|(?:^|\/)catalogue\/(?!category\/)[^?#]+\/index\.html)/i.test(
        href,
      )
    ) {
      continue;
    }

    const label = attribute(openingTag, "aria-label") || attribute(openingTag, "title") || stripMarkup(link);
    if (!generic.test(label)) addUnique(products, label, 12);
  }
}

function collectVisiblePrices(html: string, prices: string[]): void {
  const visible = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const matches = visible.match(
    /(?:US|CA|AU|NZ)?[$£€]\s?\d[\d,.]*(?:[.,]\d{2})?|(?:USD|EUR|GBP|CAD|AUD|NZD)\s?\d[\d,.]*(?:[.,]\d{2})?/gi,
  );
  matches?.forEach((price) => addUnique(prices, price.replace(/\s+/g, " "), 12));
}

const CATEGORIES: Array<[string, string[]]> = [
  ["books and media", ["book", "bookseller", "fiction", "literature", "novel", "paperback"]],
  ["fashion and apparel", ["apparel", "clothing", "dress", "hoodie", "jacket", "shirt", "shoes", "sneaker"]],
  ["beauty and skincare", ["beauty", "cosmetic", "makeup", "serum", "skincare", "moisturizer", "fragrance"]],
  ["home and interiors", ["decor", "furniture", "homeware", "interior", "lamp", "sofa", "table"]],
  ["food and drink", ["coffee", "drink", "food", "snack", "tea", "wine", "chocolate"]],
  ["electronics", ["audio", "camera", "charger", "electronic", "headphone", "laptop", "phone"]],
  ["jewelry and accessories", ["accessories", "bracelet", "earring", "jewelry", "necklace", "ring", "watch"]],
  ["fitness and outdoors", ["camping", "cycling", "fitness", "gym", "outdoor", "running", "yoga"]],
  ["pet supplies", ["cat", "dog", "pet", "puppy", "veterinary"]],
];

function inferCategory(title: string, description: string, products: string[], text: string): string {
  const strongSignals = `${title} ${description} ${products.join(" ")}`.toLowerCase();
  const weakSignals = text.slice(0, 15_000).toLowerCase();
  let best = { category: "online retail", score: 0 };

  const includesKeyword = (source: string, keyword: string): boolean => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(source);
  };

  for (const [category, words] of CATEGORIES) {
    const score = words.reduce(
      (total, word) =>
        total + (includesKeyword(strongSignals, word) ? 3 : 0) + (includesKeyword(weakSignals, word) ? 1 : 0),
      0,
    );
    if (score > best.score) best = { category, score };
  }

  return best.score >= 2 ? best.category : "online retail";
}

function summarizePrices(prices: string[]): string {
  if (!prices.length) return "Not exposed on the homepage";
  return prices.slice(0, 3).join(" · ");
}

export function extractSiteSignals(html: string): SiteSignals {
  const rawTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const ogTitle = metaContent(html, ["og:title", "twitter:title"]);
  const title = stripMarkup(rawTitle || ogTitle).slice(0, 140) || "Untitled store";
  const description = metaContent(html, ["description", "og:description", "twitter:description"]).slice(0, 320);
  const platform = detectPlatform(html);
  const products: string[] = [];
  const prices: string[] = [];

  collectStructuredData(html, products, prices);
  collectProductLinks(html, products);
  collectVisiblePrices(html, prices);

  const genericProductLabels = /^(?:best sellers?|collection|featured|men'?s?|new arrivals?|products?|sale|shop|shop all|shop men|shop women|women'?s?)$/i;
  const filteredProducts = products.filter(
    (product) =>
      product.toLowerCase() !== title.toLowerCase() &&
      !genericProductLabels.test(product) &&
      !/[<>{}=]|\b(?:class|item|v-text)\s*[.=]/i.test(product),
  );
  const text = stripMarkup(html).slice(0, 20_000);
  const category = inferCategory(title, description, filteredProducts, text);

  return {
    title,
    description,
    platform,
    category,
    products: filteredProducts.slice(0, 8),
    prices: prices.slice(0, 8),
    priceSignal: summarizePrices(prices),
    text: text.slice(0, 3_000),
  };
}

function isPrivateAddress(rawAddress: string): boolean {
  const address = rawAddress.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (address.startsWith("::ffff:")) return isPrivateAddress(address.slice(7));

  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  if (isIP(address) === 6) {
    return (
      address === "::" ||
      address === "::1" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      /^fe[89ab]/.test(address) ||
      address.startsWith("ff") ||
      address.startsWith("2001:db8")
    );
  }

  return true;
}

async function assertPublicUrl(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    Boolean(url.username) ||
    Boolean(url.password) ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new SiteAnalysisError("Enter a public store URL, not a local or private address.", 400);
  }

  let addresses: string[];
  if (isIP(hostname.replace(/^\[|\]$/g, ""))) {
    addresses = [hostname];
  } else {
    try {
      addresses = (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
    } catch {
      throw new SiteAnalysisError("We couldn't find that store. Check the URL and try again.", 422);
    }
  }

  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw new SiteAnalysisError("Enter a public store URL, not a local or private address.", 400);
  }
}

export function normalizeStoreUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2_048) {
    throw new SiteAnalysisError("Enter a valid store URL.", 400);
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new SiteAnalysisError("Enter a valid store URL, like your-store.com.", 400);
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new SiteAnalysisError("Enter a public http(s) store URL.", 400);
  }

  url.hash = "";
  return url;
}

async function readLimitedHtml(response: Response): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_HTML_BYTES) {
    throw new SiteAnalysisError("That page is too large to analyze safely.", 413);
  }

  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let html = "";
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new SiteAnalysisError("That page is too large to analyze safely.", 413);
    }
    html += decoder.decode(value, { stream: true });
  }

  return html + decoder.decode();
}

export async function fetchStorefront(input: string): Promise<{ html: string; url: string }> {
  let current = normalizeStoreUrl(input);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(current);

    let response: Response;
    try {
      response = await fetch(current, {
        cache: "no-store",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; Agent2StoreAnalyzer/1.0)",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new SiteAnalysisError("We couldn't connect to that store. Check the URL and try again.", 502);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new SiteAnalysisError("That store returned an invalid redirect.", 502);
      if (redirect === MAX_REDIRECTS) throw new SiteAnalysisError("That store redirected too many times.", 502);
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new SiteAnalysisError(`That store returned ${response.status}. Try its public homepage URL.`, 502);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new SiteAnalysisError("That URL isn't an HTML storefront page.", 415);
    }

    const html = await readLimitedHtml(response);
    if (!html.trim()) throw new SiteAnalysisError("That storefront returned an empty page.", 502);
    return { html, url: current.toString() };
  }

  throw new SiteAnalysisError("That store redirected too many times.", 502);
}

export function scriptedSiteAnalysis(
  signals: SiteSignals,
  concerns: string,
): Pick<SiteAnalysisResult, "summary"> & { reason: string } {
  const platform = signals.platform === "Unknown" ? "" : `${signals.platform} `;
  const productNote = signals.products.length
    ? ` Its visible catalog includes ${signals.products.slice(0, 3).join(", ")}.`
    : signals.description
      ? ` ${signals.description}`
      : "";
  const priceNote = signals.prices.length ? ` Price signals include ${signals.priceSignal}.` : "";
  const concern = concerns.trim().slice(0, 160);

  let reason: string;
  if (concern) {
    reason = `You called out “${concern}”; Cart Recovery directly follows up with shoppers who showed buying intent but left before checkout.`;
  } else if (signals.platform === "Shopify") {
    reason = "Shopify already captures the checkout and product context needed to trigger a personal recovery message, making this the fastest automation to put revenue back in play.";
  } else if (signals.prices.length) {
    reason = `With visible products around ${signals.priceSignal}, each unfinished cart has enough value to justify an immediate, personalized recovery sequence.`;
  } else {
    reason = "The store has a browsable product journey, so following up with high-intent shoppers who leave before paying is the clearest first revenue automation.";
  }

  return {
    summary: `${signals.title} is a ${platform}${signals.category} store.${productNote}${priceNote}`,
    reason,
  };
}

export function buildSiteAnalysisResult(
  url: string,
  signals: SiteSignals,
  concerns: string,
  analysis: { summary: string; reason: string },
  source: SiteAnalysisResult["source"],
): SiteAnalysisResult {
  const evidence: SiteEvidence[] = [
    { label: "Platform", value: signals.platform === "Unknown" ? "No clear signature" : signals.platform },
    { label: "Store type", value: signals.category },
    {
      label: "Catalog",
      value: signals.products.length ? `${signals.products.length} products identified` : "Storefront detected",
    },
    { label: "Price signal", value: signals.priceSignal },
  ];

  return {
    store: {
      url,
      title: signals.title,
      description: signals.description,
      platform: signals.platform,
      category: signals.category,
      sells: signals.products,
      priceSignal: signals.priceSignal,
    },
    evidence,
    summary: analysis.summary,
    recommendation: {
      automationId: "recovery",
      name: "Cart Recovery",
      reason: analysis.reason,
    },
    source,
    concerns,
  };
}
