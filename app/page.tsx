"use client";

import { useState } from "react";
import type { CartMetrics, ShopifyCheckout } from "@/lib/types";

type Stage = "idle" | "connecting" | "analyzing" | "ready" | "sending" | "sent";

interface RecoveryMessage {
  subject: string;
  body: string;
}

interface LiveSendResult {
  sent: boolean;
  reason?: string;
  subject: string;
  body: string;
  to: string;
}

function formatCurrency(value: number, currency: string) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  });
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("idle");
  const [metrics, setMetrics] = useState<CartMetrics | null>(null);
  const [source, setSource] = useState<"shopify" | "mock" | null>(null);
  const [storeDomain, setStoreDomain] = useState<string | null>(null);
  const [sentence, setSentence] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [exampleMessage, setExampleMessage] = useState<RecoveryMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live-demo state: detect a real new abandoned checkout and actually email it.
  const [knownIds, setKnownIds] = useState<Set<number>>(new Set());
  const [liveCart, setLiveCart] = useState<ShopifyCheckout | null>(null);
  const [liveEmail, setLiveEmail] = useState("");
  const [checkingLive, setCheckingLive] = useState(false);
  const [liveCheckMessage, setLiveCheckMessage] = useState<string | null>(null);
  const [sendingLive, setSendingLive] = useState(false);
  const [liveResult, setLiveResult] = useState<LiveSendResult | null>(null);

  async function handleConnect() {
    setError(null);
    setStage("connecting");
    try {
      const cartsRes = await fetch("/api/carts");
      if (!cartsRes.ok) throw new Error("Could not load cart data");
      const cartsData = await cartsRes.json();

      setMetrics(cartsData.metrics);
      setSource(cartsData.source);
      setStoreDomain(cartsData.storeDomain);
      setKnownIds(new Set<number>(cartsData.checkouts.map((c: ShopifyCheckout) => c.id)));
      setStage("analyzing");

      const narrateRes = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: cartsData.metrics }),
      });
      const narrateData = await narrateRes.json();
      setSentence(narrateData.sentence);
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStage("idle");
    }
  }

  async function handleSend() {
    if (!metrics) return;
    setStage("sending");
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics }),
      });
      if (!res.ok) throw new Error("Could not send recovery messages");
      const data = await res.json();
      setConfirmation(data.confirmation);
      setExampleMessage(data.exampleMessage);
      setStage("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStage("ready");
    }
  }

  async function handleCheckLive() {
    setCheckingLive(true);
    setLiveCheckMessage(null);
    try {
      const res = await fetch("/api/carts/latest");
      if (!res.ok) throw new Error("Could not check for new carts");
      const data = await res.json();
      const fresh: ShopifyCheckout[] = data.checkouts.filter(
        (c: ShopifyCheckout) => !knownIds.has(c.id)
      );

      if (fresh.length === 0) {
        setLiveCheckMessage("No new carts yet — try again in a moment.");
      } else {
        const newest = fresh.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        setKnownIds((prev) => new Set([...prev, ...fresh.map((c) => c.id)]));
        setLiveCart(newest);
        setLiveEmail(newest.email || "");
        setLiveResult(null);
      }
    } catch (e) {
      setLiveCheckMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCheckingLive(false);
    }
  }

  async function handleSendLive() {
    if (!liveCart || !liveEmail) return;
    setSendingLive(true);
    try {
      const res = await fetch("/api/send-real", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: liveEmail, checkout: liveCart }),
      });
      const data = await res.json();
      setLiveResult(data);
    } catch {
      setLiveResult({
        sent: false,
        reason: "Request failed",
        subject: "",
        body: "",
        to: liveEmail,
      });
    } finally {
      setSendingLive(false);
    }
  }

  function reset() {
    setStage("idle");
    setMetrics(null);
    setSource(null);
    setStoreDomain(null);
    setSentence(null);
    setConfirmation(null);
    setExampleMessage(null);
    setError(null);
    setKnownIds(new Set());
    setLiveCart(null);
    setLiveEmail("");
    setLiveCheckMessage(null);
    setLiveResult(null);
  }

  const showLiveDemo = stage === "ready" || stage === "sending" || stage === "sent";

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="w-full max-w-xl">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Cart Recovery Agent
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Find and recover abandoned checkouts automatically
          </h1>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {stage === "idle" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Connect your Shopify store and the agent will pull your real abandoned
                checkouts, tell you what they&apos;re worth, and offer to send recovery
                messages.
              </p>
              <button
                onClick={handleConnect}
                className="flex h-11 items-center justify-center rounded-full bg-zinc-950 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                Connect Shopify Store
              </button>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          )}

          {(stage === "connecting" || stage === "analyzing") && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950 dark:border-zinc-700 dark:border-t-white" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {stage === "connecting"
                  ? "Connecting to Shopify and pulling abandoned checkouts…"
                  : "Analyzing cart value and writing a summary…"}
              </p>
            </div>
          )}

          {(stage === "ready" || stage === "sending") && metrics && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Abandoned carts" value={String(metrics.count)} />
                <Stat
                  label="Total value"
                  value={formatCurrency(metrics.totalValue, metrics.currency)}
                />
                <Stat label="Oldest cart" value={`${metrics.oldestAgeDays}d`} />
              </div>

              {source === "mock" && (
                <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                  Showing demo data — connect a real store to see live numbers.
                </p>
              )}
              {source === "shopify" && storeDomain && (
                <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                  Live data from {storeDomain}
                </p>
              )}

              {sentence && (
                <p className="rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  {sentence}
                </p>
              )}

              <button
                onClick={handleSend}
                disabled={stage === "sending"}
                className="flex h-11 items-center justify-center rounded-full bg-zinc-950 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {stage === "sending" ? "Sending…" : "Send recovery messages"}
              </button>
              {error && <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          )}

          {stage === "sent" && metrics && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <span>✓</span>
                <span>{confirmation}</span>
              </div>

              {exampleMessage && (
                <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Example message
                  </p>
                  <p className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {exampleMessage.subject}
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {exampleMessage.body}
                  </p>
                </div>
              )}

              <button
                onClick={reset}
                className="flex h-11 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                Start over
              </button>
            </div>
          )}
        </div>

        {showLiveDemo && (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Live demo
            </p>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Have someone abandon a real checkout on the connected store, then check for it
              here — this sends an actual email, not a fake confirmation.
            </p>

            <button
              onClick={handleCheckLive}
              disabled={checkingLive}
              className="mb-4 flex h-10 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {checkingLive ? "Checking…" : "Check for new cart"}
            </button>

            {liveCheckMessage && (
              <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{liveCheckMessage}</p>
            )}

            {liveCart && (
              <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
                <div>
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    New cart detected —{" "}
                    {formatCurrency(parseFloat(liveCart.total_price), liveCart.currency)}
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    {liveCart.line_items.map((i) => `${i.quantity}x ${i.title}`).join(", ")}
                  </p>
                </div>

                <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Send recovery email to
                  <input
                    type="email"
                    value={liveEmail}
                    onChange={(e) => setLiveEmail(e.target.value)}
                    placeholder="recipient@example.com"
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>

                <button
                  onClick={handleSendLive}
                  disabled={sendingLive || !liveEmail}
                  className="flex h-10 items-center justify-center rounded-full bg-emerald-700 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
                >
                  {sendingLive ? "Sending…" : "Send real recovery email"}
                </button>

                {liveResult && (
                  <div className="rounded-lg bg-white p-3 text-sm dark:bg-zinc-900">
                    {liveResult.sent ? (
                      <p className="font-medium text-emerald-700 dark:text-emerald-400">
                        ✓ Real email sent to {liveResult.to}
                      </p>
                    ) : (
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        Not actually sent — {liveResult.reason === "not_configured"
                          ? "add RESEND_API_KEY in .env.local to deliver for real"
                          : liveResult.reason}
                        . Preview below:
                      </p>
                    )}
                    <p className="mt-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      {liveResult.subject}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{liveResult.body}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-zinc-50 py-4 dark:bg-zinc-900">
      <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{value}</span>
      <span className="mt-1 text-center text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
    </div>
  );
}
