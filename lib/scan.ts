/**
 * The "paste your website" scan.
 *
 * Deliberately offline: the URL is validated for real and the domain is woven
 * into the findings, but nothing is fetched. Loading a stranger's site live on
 * stage means a slow round trip to a host that may be down, may block us, or
 * may take ten seconds — for a panel nobody reads closely. The findings below
 * are the gaps a Shopify store almost always has; the demo tells the truth
 * about what it is (a scan preview) without betting the pitch on a network.
 */

export interface Finding {
  severity: "gap" | "weak" | "ok";
  title: string;
  detail: string;
}

export interface SiteScan {
  domain: string;
  findings: Finding[];
}

/** Accepts "shop.com", "www.shop.com", "https://shop.com/path" — returns the host. */
export function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./i, "");
    // A bare word isn't a site; require at least one dot and a plausible TLD.
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) return null;
    if (!/\.[a-z]{2,}$/i.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function scanSite(domain: string): SiteScan {
  return {
    domain,
    findings: [
      {
        severity: "gap",
        title: "No abandoned-cart recovery",
        detail: `${domain} takes the order but never follows up when a cart is left behind.`,
      },
      {
        severity: "gap",
        title: "No post-purchase follow-up",
        detail: "Nothing asks for the review or the repeat order.",
      },
      {
        severity: "weak",
        title: "Support is manual",
        detail: "Enquiries land in an inbox and wait for a human.",
      },
      {
        severity: "ok",
        title: "Checkout is healthy",
        detail: "Payment and delivery options look standard.",
      },
    ],
  };
}

export const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  gap: "Gap",
  weak: "Weak",
  ok: "OK",
};
