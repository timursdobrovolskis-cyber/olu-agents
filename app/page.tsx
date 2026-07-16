"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  automationById,
  describeAnswer,
  isAnswered,
  isRecommendation,
  mockRecommendation,
  visibleQuestions,
  type Answers,
  type EmailPreview,
  type Question,
  type Recommendation,
  type RecommendRequest,
  type Verdict,
} from "@/lib/intake";

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

function RuledOutRow({ verdict }: { verdict: Verdict }) {
  const auto = automationById(verdict.automationId);
  if (!auto) return null;
  return (
    <div className="ruled-row">
      <span className="label">{auto.code}</span>
      <span>
        <span className="ruled-name">{auto.name}</span>{" "}
        <span className="option-note" style={{ textTransform: "none" }}>
          {verdict.reason}
        </span>
      </span>
    </div>
  );
}

/** The recommendation, issued as a boarding-pass gate card. */
function VerdictCard({ rec }: { rec: Recommendation }) {
  const auto = automationById(rec.chosen.automationId);
  if (!auto) return null;
  return (
    <figure className="verdict" style={{ margin: 0 }}>
      <div className="stub stub-accent" aria-hidden="true">
        Recommended build →
      </div>
      <div className="verdict-main">
        <div className="verdict-head">
          <span className="label label-ink">[ Verdict ]</span>
          <span className="label">Olu / D-01</span>
        </div>
        <div className="verdict-body">
          <span className="label">Build</span>
          <data className="verdict-gate">{auto.code}</data>
          <h2 className="verdict-name">{auto.name}</h2>
          <p className="verdict-blurb">{auto.blurb}</p>
          <p className="verdict-reason">{rec.chosen.reason}</p>
        </div>
        <div className="ruled">
          <div className="ruled-row" style={{ opacity: 1 }}>
            <span className="label">Declined</span>
            <span className="label">Scored lower</span>
          </div>
          {rec.ruledOut.map((v) => (
            <RuledOutRow key={v.automationId} verdict={v} />
          ))}
        </div>
        <div className="email-foot">
          <div className="barcode" aria-hidden="true" />
        </div>
      </div>
    </figure>
  );
}

/** One question: pictogram answer bars, an "other" escape hatch, confirm. */
function QuestionBlock({
  question,
  step,
  total,
  onAnswer,
}: {
  question: Question;
  step: number;
  total: number;
  onAnswer: (a: { selected: string[]; other?: string }) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const otherRef = useRef<HTMLInputElement>(null);

  const multi = question.kind === "multi";
  const otherOn = selected.includes("other");
  const ready = otherOn
    ? Boolean(other.trim())
    : selected.length > 0;

  useEffect(() => {
    if (otherOn) otherRef.current?.focus();
  }, [otherOn]);

  function toggle(id: string) {
    if (!multi) {
      setSelected([id]);
      // Single-choice with a concrete option needs no confirmation step.
      if (id !== "other") onAnswer({ selected: [id] });
      return;
    }
    // Functional update: two taps inside one render batch must not drop one.
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const rows = [
    ...question.options,
    { id: "other", label: question.otherLabel, note: "Tell us in your words", icon: "other" as const },
  ];

  return (
    <div className="msg msg-agent" style={{ maxWidth: "100%" }}>
      <div className="msg-head">
        <span className="label">Agent →</span>
        <span className="progress" aria-label={`Step ${step} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`progress-cell ${i < step ? "progress-cell-on" : ""}`}
            />
          ))}
        </span>
      </div>
      <p className="msg-body" style={{ margin: 0 }}>
        {question.prompt}
      </p>

      <div className="options" style={{ marginTop: "0.5rem" }} role="group">
        {rows.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className={`option ${on ? "option-on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(o.id)}
            >
              <span className="option-icon">
                <Icon name={o.icon} />
              </span>
              <span className="option-text">
                <span className="option-label">{o.label}</span>
                <span className="option-note">{o.note}</span>
              </span>
              <span className="option-mark" aria-hidden="true">
                {multi ? (on ? "[X]" : "[ ]") : "→"}
              </span>
            </button>
          );
        })}
      </div>

      {otherOn ? (
        <div className="other-field">
          <input
            ref={otherRef}
            className="composer-input"
            value={other}
            placeholder="Type your answer"
            aria-label={question.otherLabel}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) {
                e.preventDefault();
                onAnswer({ selected, other });
              }
            }}
          />
        </div>
      ) : null}

      {multi || otherOn ? (
        <button
          type="button"
          className="confirm"
          disabled={!ready}
          onClick={() => onAnswer({ selected, other: other.trim() || undefined })}
        >
          Confirm <span aria-hidden="true">↗</span>
        </button>
      ) : null}
    </div>
  );
}

export default function Home() {
  const [answers, setAnswers] = useState<Answers>({});
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  const queue = visibleQuestions(answers);
  const current = queue.find((q) => !isAnswered(q, answers));
  const answered = queue.filter((q) => isAnswered(q, answers));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [answers, rec, pending]);

  // Once every visible question is answered, ask the backend to decide. The
  // guard keeps React's re-renders from firing this twice.
  useEffect(() => {
    if (current || rec || asked.current) return;
    asked.current = true;

    const field = queue.find((q) => q.id === "field");
    const problems = queue.find((q) => q.id === "problems");
    const product = queue.find((q) => q.id === "product");

    const payload: RecommendRequest = {
      field: {
        id: answers.field?.selected[0] ?? "other",
        label: field ? describeAnswer(field, answers.field!) : "",
      },
      problems: (answers.problems?.selected ?? []).map((id) => ({
        id,
        label:
          problems?.options.find((o) => o.id === id)?.label ??
          answers.problems?.other ??
          id,
      })),
      ...(product && answers.product
        ? {
            product: {
              id: answers.product.selected[0],
              label: describeAnswer(product, answers.product),
            },
          }
        : {}),
    };

    setPending(true);
    (async () => {
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        // Until the backend lands, /api/recommend 404s — route locally instead.
        if (res.status === 404) {
          setRec(mockRecommendation(answers));
          return;
        }
        if (!res.ok) throw new Error(`Agent returned ${res.status}`);

        const data: unknown = await res.json();
        if (!isRecommendation(data)) throw new Error("Malformed response");
        setRec(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown fault");
        setRec(mockRecommendation(answers));
      } finally {
        setPending(false);
      }
    })();
  }, [current, rec, answers, queue]);

  return (
    <main className="shell">
      <header className="header">
        <div className="stub" aria-hidden="true">
          Intake / Olu / Unit D-01
        </div>
        <div className="header-body">
          <div className="header-row">
            <span className="label label-ink">[ Olu Supply Co. ]</span>
            <span className="label status-live">
              <span className="status-dot" aria-hidden="true" />
              Online
            </span>
          </div>
          <h1 className="header-title">Build Intake</h1>
          <div className="dots" aria-hidden="true" />
          <div className="header-data">
            <div className="header-cell">
              <span className="label">Questions</span>
              <data className="datum">{queue.length}</data>
            </div>
            <div className="header-cell">
              <span className="label">Desk</span>
              <data className="datum">A/02</data>
            </div>
          </div>
        </div>
      </header>

      <div className="transcript" aria-live="polite">
        <article className="msg msg-agent">
          <div className="msg-head">
            <span className="label">Agent →</span>
          </div>
          <p className="msg-body" style={{ margin: 0 }}>
            Three questions and I&apos;ll tell you which automation to build
            first — and why the other two can wait.
          </p>
        </article>

        {answered.map((q) => (
          <article key={q.id} className="msg msg-user">
            <div className="msg-head">
              <span className="label">You</span>
            </div>
            <p className="msg-body" style={{ margin: 0 }}>
              {describeAnswer(q, answers[q.id]!)}
            </p>
          </article>
        ))}

        {current ? (
          <QuestionBlock
            key={current.id}
            question={current}
            step={answered.length + 1}
            total={queue.length}
            onAnswer={(a) =>
              setAnswers((prev) => ({ ...prev, [current.id]: a }))
            }
          />
        ) : null}

        {pending ? (
          <article className="msg msg-agent">
            <div className="msg-head">
              <span className="label">Agent →</span>
            </div>
            <div className="typing" aria-label="Agent is deciding">
              <span className="typing-block" />
              <span className="typing-block" />
              <span className="typing-block" />
            </div>
          </article>
        ) : null}

        {rec ? (
          <article className="msg msg-agent" style={{ maxWidth: "100%" }}>
            <div className="msg-head">
              <span className="label">Agent →</span>
            </div>
            <VerdictCard rec={rec} />
            {rec.email ? <EmailStub email={rec.email} /> : null}
            {error ? (
              <p className="option-note" style={{ marginTop: "0.5rem" }}>
                {"/// Routed locally — "}
                {error}
              </p>
            ) : null}
          </article>
        ) : null}

        <div ref={endRef} />
      </div>

      <footer className="composer">
        <span
          className="label"
          style={{ padding: "0.9375rem 0.875rem", alignSelf: "center" }}
        >
          {rec
            ? "Intake complete — check your inbox"
            : "Tap an answer above to continue"}
        </span>
        <span
          className="send"
          style={{ background: "var(--tint)", color: "var(--rule-color)" }}
          aria-hidden="true"
        >
          {rec ? "Done" : `${answered.length}/${queue.length}`}
        </span>
      </footer>
    </main>
  );
}
