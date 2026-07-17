# frontend ↔ backend contract

The demo runs in two acts and calls three endpoints. **Every one of them has a
local fallback**, so the pitch survives all three being absent — build them in
whatever order suits you.

| Act | Endpoint | When |
| --- | --- | --- |
| 1 — intake | `POST /api/recommend` | Once, after the last question |
| 2 — build | `POST /api/build` | Once, when the pitcher hits Build |
| 2 — chat | `POST /api/chat` | Per message, after the build |

> **Supersedes the deleted `CHAT_CONTRACT.md`.** `/api/chat` exists again, but
> it is *not* the old conversational front door — it only answers questions
> about an automation that has already been built.

**The pitch path is `Fashion & Apparel` → `Cart abandonment` → `One-off
purchase`**, which routes to `recovery`. If time is short, make that path good
and let the rest fall back.

Types live in [`lib/intake.ts`](lib/intake.ts) (act 1) and
[`lib/build.ts`](lib/build.ts) (act 2) — import them in the route handlers
rather than redeclaring, so the two sides can't drift.

## What the frontend does on its own

The questions, their options, the branching, and the "Other" free-text path are
all frontend data (`QUESTIONS` in `lib/intake.ts`). The backend never sees a
partial intake and never picks the next question.

Question 3 is **conditional**: it's skipped when `field` is `digital`
(services aren't a product), so `product` may be absent.

## Request

`POST /api/recommend`, `Content-Type: application/json`

```jsonc
{
  "field":    { "id": "beauty", "label": "Beauty & Cosmetics" },
  "problems": [
    { "id": "forecast",  "label": "No selling forecast" },
    { "id": "analytics", "label": "No read on progress" }
  ],
  "product":  { "id": "subscription", "label": "Subscription / refill" }  // OPTIONAL
}
```

- `problems` is multi-select, so it's an array — possibly with one entry, never
  empty. Known ids: `leads` | `gigs` | `abandonment` | `comms` | `forecast` |
  `analytics`.
- Three of these look alike but aren't. `gigs` is a **demand** problem (nothing
  coming in), `leads` is a **conversion** problem (traffic that doesn't buy),
  and `abandonment` is a **checkout** problem (reached the cart, then left).
- `gigs` is deliberately field-sensitive: it points at Cart Recovery for a shop
  but Client Concierge for a service business, so the field breaks the tie.
- `abandonment` maps almost one-to-one onto Cart Recovery. If the user picks it,
  any sane verdict is `recovery` — don't overthink it.
- If the user chose "Other", `id` is `"other"` and `label` is **their typed
  text**. Handle it as free text; it won't match any known id.
- `product` is absent for service businesses.

## Response

`200` with the verdict:

```jsonc
{
  "chosen": {
    "automationId": "forecast",              // must match an id in AUTOMATIONS
    "score": 7,
    "reason": "Scores highest against no selling forecast and no read on progress."
  },
  "ruledOut": [                               // the other two, best-first
    { "automationId": "concierge", "score": 1, "reason": "Helps, but relieves less of what you named." },
    { "automationId": "recovery",  "score": 0, "reason": "Doesn't address anything you flagged." }
  ],
  "email": {                                  // OPTIONAL — omit if nothing was sent
    "to": "you@yourstore.com",
    "subject": "Your automation plan — Forecast Desk",
    "body": "Based on your answers we'd build...",
    "status": "sent"                          // "sent" | "queued" | "failed"
  }
}
```

- `automationId` **must** be one of `recovery` | `concierge` | `forecast` (see
  `AUTOMATIONS` in `lib/intake.ts`). An unknown id renders nothing — the
  frontend looks the name, code, and blurb up locally from that table, so you
  only send the id. Don't send names or copy.
- `reason` is shown verbatim to the user. One sentence, plain language.
- `ruledOut` should contain the other two, ordered best-first. It may be empty
  but the card looks thin.
- `email` presence renders the stub. Populate it whenever a send happens.

## Errors and the 404 fallback

While `/api/recommend` doesn't exist, the frontend catches the `404` and routes
locally via `scoreAutomations()` — a transparent weighted model in
`lib/intake.ts`. **Creating the route disables the fallback automatically.**

On any other failure the frontend falls back to the local routing *and* shows a
small note that it routed locally, so the demo never dead-ends. Prefer returning
`200` with a sensible verdict over a `500`.

## The routing model

`scoreAutomations()` is the reference implementation: each automation carries a
`weights` map (problem → 0-3 relief), scores are summed over the selected
problems, then nudged by product kind and field. The backend is free to reason
differently (that's the point of an LLM), but the local model is what the demo
falls back to and is worth matching in spirit.

**Renaming the three automations is safe** — edit `AUTOMATIONS` and both the UI
and the routing follow. Only the `id`s are part of this contract.

---

# Act 2 — `POST /api/build`

Called once when the pitcher hits Build, after the verdict. Returns the
automation skeleton, which the UI reveals one step at a time.

```jsonc
// request
{
  "automationId": "recovery",
  "files": [                                  // may be empty — importing is optional
    { "name": "orders_2026.csv", "size": 48210, "kind": "text/csv" }
  ]
}
```

**Files are metadata only.** The frontend never uploads contents — it reads
name, size and type locally and lists them. If you want the real bytes, say so
and I'll add a multipart upload; don't assume they're arriving.

```jsonc
// response
{
  "steps": [
    { "kind": "trigger", "title": "Checkout abandoned", "detail": "Shopify webhook — cart idle for 60 minutes" },
    { "kind": "guard",   "title": "Contactable & consented", "detail": "Has email, marketing consent true" }
  ]
}
```

- `kind` must be one of `trigger` | `guard` | `fetch` | `compose` | `dispatch` |
  `follow` | `stop`. It drives the colour of the tag: `trigger` and `dispatch`
  are ochre, `stop` is brick, the rest carbon.
- `title` is short (2-4 words). `detail` is one line — it renders small and must
  not wrap past two lines at 1080p.
- 4-8 steps. Seven is what the local skeleton uses and what the column fits.
- Anything non-200, malformed, or empty falls back to `skeletonFor()` in
  `lib/build.ts` — which is a genuine Cart Recovery skeleton, so a failure here
  is invisible.

# Act 2 — `POST /api/chat`

Per message, after the build. Scoped to the automation just built — this is not
a general assistant.

```jsonc
// request
{ "automationId": "recovery", "message": "how soon does it send?", "history": [ { "role": "agent", "content": "Skeleton's up…" } ] }

// response
{ "reply": "It fires 60 minutes after the cart goes idle." }
```

- `role` is `"user" | "agent"` — **not** `"assistant"`. Map it at the boundary.
- Keep replies to 1-2 sentences. This renders on a projected screen; a paragraph
  is unreadable from the back and kills the pace.
- Any failure falls back to `mockReply()` in `lib/build.ts` — keyword-matched
  canned answers covering timing, edits, data, spam, cost, and going live.
