# `/api/recommend` — frontend ↔ backend contract

> **This replaces `CHAT_CONTRACT.md`.** The product is no longer a free-text
> chatbot. The frontend runs a fixed questionnaire and calls the backend **once**,
> at the end, with all answers. There is no `/api/chat` and no per-turn call.

Types live in [`lib/intake.ts`](lib/intake.ts) — import them in the route handler
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
  empty.
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
