# `/api/chat` — frontend ↔ backend contract

The chat screen (`app/page.tsx`) is the only caller. It makes exactly one
request per user turn. Types live in [`lib/chat.ts`](lib/chat.ts) — import them
in the route handler rather than redeclaring, so the two sides can't drift.

## Request

`POST /api/chat`, `Content-Type: application/json`

```jsonc
{
  "message": "where is my order?",       // the user's new turn, trimmed, non-empty
  "history": [                            // every prior turn, oldest first, excludes `message`
    { "role": "agent", "content": "Support agent online. ..." },
    { "role": "user",  "content": "hi" }
  ]
}
```

`role` is `"user" | "agent"` — **not** `"assistant"`. Map it at the boundary if
you pass history to the Anthropic SDK.

The opening greeting is rendered client-side and *is* included in `history`.

## Response

`200` with:

```jsonc
{
  "reply": "Found your cart — 2 items, still saved. I've emailed you a link.",
  "email": {                              // OPTIONAL — omit entirely if no email was sent
    "to": "customer@example.com",
    "subject": "Your cart is still saved",
    "body": "Hi there — your cart is still waiting for you...",
    "status": "sent"                      // "sent" | "queued" | "failed"
  }
}
```

- `reply` is **required** and must be a string; the frontend rejects the
  response as malformed without it.
- Include `email` only when the agent actually fired one. Its presence is what
  renders the red "email sent →" panel under the reply — that's the demo's
  money shot, so populate it whenever a send happens.
- `body` renders as plain text with newlines preserved. Not HTML.

## Errors

Any non-2xx (other than 404) surfaces in the transcript as a red fault line
showing the status code. Prefer returning `200` with a graceful `reply` over a
`500` — a red error block on stage looks worse than the agent saying it's stuck.

## The 404 fallback

While `/api/chat` doesn't exist, the frontend catches the `404` and answers from
`mockResponse()` in `lib/chat.ts` so the UI is demoable standalone. **Creating
the route removes the fallback automatically** — no frontend change needed. The
mock is never consulted once the route returns anything other than 404.
