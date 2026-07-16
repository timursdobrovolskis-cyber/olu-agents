export interface ShopifyCheckout {
  id: number;
  email: string | null;
  total_price: string;
  currency: string;
  created_at: string;
  abandoned_checkout_url: string | null;
  line_items: { title: string; quantity: number }[];
}

export interface CartMetrics {
  count: number;
  totalValue: number;
  currency: string;
  oldestAgeDays: number;
  windowDays: number;
}

export interface CartsResponse {
  metrics: CartMetrics;
  checkouts: ShopifyCheckout[];
  source: "shopify" | "mock";
  storeDomain: string | null;
}

export interface LatestCheckoutsResponse {
  checkouts: ShopifyCheckout[];
  source: "shopify" | "mock";
}
