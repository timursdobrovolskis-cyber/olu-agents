import type { ShopifyCheckout } from "./types";
import { generateMockCheckouts, generateNextMockCheckout } from "./mockData";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const WINDOW_DAYS = 7;
const POLL_WINDOW_MINUTES = 20;

export interface FetchCheckoutsResult {
  checkouts: ShopifyCheckout[];
  source: "shopify" | "mock";
  storeDomain: string | null;
}

export async function fetchAbandonedCheckouts(): Promise<FetchCheckoutsResult> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!domain || !accessToken) {
    return {
      checkouts: generateMockCheckouts(),
      source: "mock",
      storeDomain: null,
    };
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const url = new URL(`https://${domain}/admin/api/${API_VERSION}/checkouts.json`);
  url.searchParams.set("limit", "250");
  url.searchParams.set("created_at_min", since.toISOString());

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { checkouts: ShopifyCheckout[] };

  return {
    checkouts: data.checkouts ?? [],
    source: "shopify",
    storeDomain: domain,
  };
}

export interface FetchLatestResult {
  checkouts: ShopifyCheckout[];
  source: "shopify" | "mock";
}

// In-memory only — holds mock "live" checkouts appended by each poll during a
// dev session, so "Check for new cart" has something new to find without a
// real store connected. Resets when the server restarts.
let mockLiveCheckouts: ShopifyCheckout[] = [];

/**
 * Polls for checkouts created very recently — used by the "Check for new
 * cart" live-demo action, distinct from the initial full-window fetch.
 */
export async function fetchLatestCheckouts(): Promise<FetchLatestResult> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!domain || !accessToken) {
    mockLiveCheckouts = [...mockLiveCheckouts, generateNextMockCheckout(mockLiveCheckouts.length)];
    return { checkouts: mockLiveCheckouts, source: "mock" };
  }

  const since = new Date(Date.now() - POLL_WINDOW_MINUTES * 60 * 1000);
  const url = new URL(`https://${domain}/admin/api/${API_VERSION}/checkouts.json`);
  url.searchParams.set("limit", "50");
  url.searchParams.set("created_at_min", since.toISOString());

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { checkouts: ShopifyCheckout[] };
  return { checkouts: data.checkouts ?? [], source: "shopify" };
}

export { WINDOW_DAYS };
