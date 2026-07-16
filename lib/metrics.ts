import type { CartMetrics, ShopifyCheckout } from "./types";
import { WINDOW_DAYS } from "./shopify";

export function computeCartMetrics(checkouts: ShopifyCheckout[]): CartMetrics {
  if (checkouts.length === 0) {
    return {
      count: 0,
      totalValue: 0,
      currency: "USD",
      oldestAgeDays: 0,
      windowDays: WINDOW_DAYS,
    };
  }

  const now = Date.now();
  let totalValue = 0;
  let oldestAgeMs = 0;

  for (const checkout of checkouts) {
    totalValue += parseFloat(checkout.total_price) || 0;
    const ageMs = now - new Date(checkout.created_at).getTime();
    if (ageMs > oldestAgeMs) oldestAgeMs = ageMs;
  }

  return {
    count: checkouts.length,
    totalValue: Math.round(totalValue * 100) / 100,
    currency: checkouts[0].currency || "USD",
    oldestAgeDays: Math.max(1, Math.round(oldestAgeMs / (24 * 60 * 60 * 1000))),
    windowDays: WINDOW_DAYS,
  };
}
