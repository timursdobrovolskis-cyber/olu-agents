"use client";

import { useEffect, useRef, useState } from "react";
import {
  isChatResponse,
  messageId,
  mockResponse,
  type ChatMessage,
  type EmailPreview,
} from "@/lib/chat";

interface TranscriptItem extends ChatMessage {
  /** Set when this agent turn also fired an email. */
  email?: EmailPreview;
  isError?: boolean;
}

const GREETING: TranscriptItem = {
  id: "m0",
  role: "agent",
  content:
    "Support agent online. Ask about an order, a cart, or a refund — I can act on it, not just talk about it.",
};

/** The email renders as a detachable ticket stub: label bar, rows, barcode. */
function EmailStub({ email }: { email: EmailPreview }) {
  return (
    <figure className="email-panel" style={{ margin: 0 }}>
      <div className="stub stub-accent" aria-hidden="true">
        Email {email.status} →
      </div>
      <div className="email-main">
        <div className="email-head">
          <span className="label label-ink">[ Dispatch ]</span>
          <span className="label">Resend ®</span>
        </div>
        <dl className="email-rows" style={{ margin: 0 }}>
          {(
            [
              ["To", email.to],
              ["Subject", email.subject],
              ["Body", email.body],
            ] as const
          ).map(([label, value]) => (
            <div className="email-row" key={label}>
              <dt className="label">{label}</dt>
              <dd className="email-value" style={{ margin: 0 }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="email-foot">
          <div className="barcode" aria-hidden="true" />
          <span className="label">No. 6 702354 58190 — Olu / D-01</span>
        </div>
      </div>
    </figure>
  );
}

export default function Home() {
  const [items, setItems] = useState<TranscriptItem[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, pending]);

  // Grow the composer with the draft, up to the CSS max-height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;

    const outgoing: TranscriptItem = {
      id: messageId(),
      role: "user",
      content: text,
    };
    const history = items
      .filter((i) => !i.isError)
      .map(({ role, content }) => ({ role, content }));

    setItems((prev) => [...prev, outgoing]);
    setDraft("");
    setPending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      // Until the backend lands, /api/chat 404s — fall back so the UI still demos.
      if (res.status === 404) {
        const mock = mockResponse(text);
        setItems((prev) => [
          ...prev,
          {
            id: messageId(),
            role: "agent",
            content: mock.reply,
            email: mock.email,
          },
        ]);
        return;
      }

      if (!res.ok) throw new Error(`Agent returned ${res.status}`);

      const data: unknown = await res.json();
      if (!isChatResponse(data)) throw new Error("Malformed agent response");

      setItems((prev) => [
        ...prev,
        {
          id: messageId(),
          role: "agent",
          content: data.reply,
          email: data.email,
        },
      ]);
    } catch (err) {
      setItems((prev) => [
        ...prev,
        {
          id: messageId(),
          role: "agent",
          isError: true,
          content: `/// Link failure — ${
            err instanceof Error ? err.message : "unknown fault"
          }`,
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <main className="shell">
      <header className="header">
        <div className="stub" aria-hidden="true">
          Support / Olu / Unit D-01
        </div>
        <div className="header-body">
          <div className="header-row">
            <span className="label label-ink">[ Olu Supply Co. ]</span>
            <span className="label status-live">
              <span className="status-dot" aria-hidden="true" />
              Online
            </span>
          </div>
          <h1 className="header-title">Store Agent</h1>
          <div className="dots" aria-hidden="true" />
          <div className="header-data">
            <div className="header-cell">
              <span className="label">Replies in</span>
              <data className="datum">1 MIN</data>
            </div>
            <div className="header-cell">
              <span className="label">Desk</span>
              <data className="datum">A/02</data>
            </div>
          </div>
        </div>
      </header>

      <div className="transcript" aria-live="polite">
        {items.map((item) => (
          <article
            key={item.id}
            className={`msg ${item.role === "user" ? "msg-user" : "msg-agent"} ${
              item.isError ? "msg-error" : ""
            }`}
            style={item.email ? { maxWidth: "100%" } : undefined}
          >
            <div className="msg-head">
              <span className="label">
                {item.role === "user" ? "You" : "Agent →"}
              </span>
            </div>
            <p className="msg-body" style={{ margin: 0 }}>
              {item.content}
            </p>
            {item.email ? <EmailStub email={item.email} /> : null}
          </article>
        ))}

        {pending ? (
          <article className="msg msg-agent">
            <div className="msg-head">
              <span className="label">Agent →</span>
            </div>
            <div className="typing" aria-label="Agent is typing">
              <span className="typing-block" />
              <span className="typing-block" />
              <span className="typing-block" />
            </div>
          </article>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={inputRef}
          className="composer-input"
          rows={1}
          value={draft}
          placeholder="Type a message"
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="send"
          type="submit"
          disabled={pending || !draft.trim()}
        >
          Send <span aria-hidden="true">↗</span>
        </button>
      </form>
    </main>
  );
}
