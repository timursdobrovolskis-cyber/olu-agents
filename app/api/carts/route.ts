import { fetchAbandonedCheckouts } from "@/lib/shopify";
import { computeCartMetrics } from "@/lib/metrics";
import type { CartsResponse } from "@/lib/types";

export async function GET() {
  try {
    const { checkouts, source, storeDomain } = await fetchAbandonedCheckouts();
    const metrics = computeCartMetrics(checkouts);

    const body: CartsResponse = { metrics, checkouts, source, storeDomain };
    return Response.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
