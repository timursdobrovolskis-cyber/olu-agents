import type { ShopifyCheckout } from "./types";

const PRODUCTS = [
  "Classic Canvas Tote",
  "Ceramic Pour-Over Set",
  "Merino Wool Beanie",
  "Recycled Wool Blanket",
  "Enamel Camp Mug",
  "Waxed Canvas Apron",
  "Linen Napkin Set",
  "Cedar Soap Bar Trio",
  "Hand-Thrown Planter",
  "Leather Card Wallet",
];

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

export function generateMockCheckouts(): ShopifyCheckout[] {
  const rand = seededRandom(42);
  const now = Date.now();
  const count = 12 + Math.floor(rand() * 6); // 12-17 carts

  return Array.from({ length: count }, (_, i) => {
    const ageHours = rand() * 24 * 7; // spread across last 7 days
    const createdAt = new Date(now - ageHours * 60 * 60 * 1000);
    const itemCount = 1 + Math.floor(rand() * 3);
    const lineItems = Array.from({ length: itemCount }, () => ({
      title: PRODUCTS[Math.floor(rand() * PRODUCTS.length)],
      quantity: 1 + Math.floor(rand() * 2),
    }));
    const totalPrice = (28 + rand() * 220).toFixed(2);

    return {
      id: 5000000000 + i,
      email: `customer${i + 1}@example.com`,
      total_price: totalPrice,
      currency: "USD",
      created_at: createdAt.toISOString(),
      abandoned_checkout_url: `https://demo-store.myshopify.com/checkouts/mock-${i}`,
      line_items: lineItems,
    };
  });
}

/**
 * Simulates one new abandoned checkout showing up "just now" — for testing
 * the live "Check for new cart" flow without a real store connected. The
 * email is a placeholder meant to be overridden with a real address before
 * actually sending.
 */
export function generateNextMockCheckout(index: number): ShopifyCheckout {
  const rand = seededRandom(1000 + index);
  const itemCount = 1 + Math.floor(rand() * 2);
  const lineItems = Array.from({ length: itemCount }, () => ({
    title: PRODUCTS[Math.floor(rand() * PRODUCTS.length)],
    quantity: 1 + Math.floor(rand() * 2),
  }));
  const totalPrice = (24 + rand() * 140).toFixed(2);

  return {
    id: 6000000000 + index,
    email: "you@example.com",
    total_price: totalPrice,
    currency: "USD",
    created_at: new Date().toISOString(),
    abandoned_checkout_url: `https://demo-store.myshopify.com/checkouts/live-${index}`,
    line_items: lineItems,
  };
}
