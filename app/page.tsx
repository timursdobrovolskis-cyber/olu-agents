"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  automationById,
  describeAnswer,
  isAnswered,
  isRecommendation,
  mockRecommendation,
  QUESTIONS,
  visibleQuestions,
  type Answers,
  type EmailPreview,
  type Question,
  type Recommendation,
  type RecommendRequest,
  type Verdict,
} from "@/lib/intake";

function EmailStub({ email }: { email: EmailPreview }) {
  return (
    <figure className="email-panel" style={{ margin: 0 }}>
      <div className="email-head">
        <span className="label">[ Dispatch ] Email {email.status} →</span>
        <span className="label">Resend ®</span>
      </div>
      <dl className="email-rows" style={{ margin: 0 }}>
        {(
          [
            ["To", email.to],
            ["Subject", email.subject],
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
        <span className="ruled-name">{auto.name}</span>
        <span className="ruled-reason"> — {verdict.reason}</span>
      </span>
    </div>
  );
}

function VerdictCard({ rec }: { rec: Recommendation }) {
  const auto = automationById(rec.chosen.automationId);
  if (!auto) return null;
  return (
    <figure className="verdict" style={{ margin: 0 }}>
      <div className="verdict-head">
        <span className="label">[ Recommended build ]</span>
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
        <div className="ruled-row">
          <span className="label">Declined</span>
          <span className="label">Scored lower</span>
        </div>
        {rec.ruledOut.map((v) => (
          <RuledOutRow key={v.automationId} verdict={v} />
        ))}
      </div>
    </figure>
  );
}

/** One question: numbered answer bars, an "other" escape hatch, confirm. */
function QuestionBlock({
  question,
  onAnswer,
  registerKeys,
}: {
  question: Question;
  onAnswer: (a: { selected: string[]; other?: string }) => void;
  registerKeys: (h: ((e: KeyboardEvent) => boolean) | null) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const otherRef = useRef<HTMLInputElement>(null);

  const multi = question.kind === "multi";
  const otherOn = selected.includes("other");
  const ready = otherOn ? Boolean(other.trim()) : selected.length > 0;

  const rows = useMemo(
    () => [
      ...question.options,
      {
        id: "other",
        label: question.otherLabel,
        note: "Type it in",
        icon: "other" as const,
      },
    ],
    [question],
  );

  useEffect(() => {
    if (otherOn) otherRef.current?.focus();
  }, [otherOn]);

  const toggle = useCallback(
    (id: string) => {
      if (!multi) {
        setSelected([id]);
        // Single-choice with a concrete option needs no confirmation step.
        if (id !== "other") onAnswer({ selected: [id] });
        return;
      }
      // Functional update: two presses inside one batch must not drop one.
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    },
    [multi, onAnswer],
  );

  const submit = useCallback(() => {
    if (!ready) return;
    onAnswer({ selected, other: other.trim() || undefined });
  }, [ready, selected, other, onAnswer]);

  // Number keys pick, Enter confirms. Typing in "other" must win over both.
  useEffect(() => {
    const handler = (e: KeyboardEvent): boolean => {
      const typing = document.activeElement === otherRef.current;

      if (e.key === "Enter") {
        if (multi || otherOn) {
          submit();
          return true;
        }
        return false;
      }
      if (typing) return false;

      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= rows.length) {
        toggle(rows[n - 1].id);
        return true;
      }
      return false;
    };
    registerKeys(handler);
    return () => registerKeys(null);
  }, [registerKeys, rows, toggle, submit, multi, otherOn]);

  return (
    <>
      <div className="options">
        {rows.map((o, i) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className={`option ${on ? "option-on" : ""}`}
              aria-pressed={on}
              onClick={() => toggle(o.id)}
            >
              <span className="key" aria-hidden="true">
                {i + 1}
              </span>
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
            className="other-input"
            value={other}
            placeholder="Type the answer"
            aria-label={question.otherLabel}
            onChange={(e) => setOther(e.target.value)}
          />
        </div>
      ) : null}

      {multi || otherOn ? (
        <button
          type="button"
          className="confirm"
          disabled={!ready}
          onClick={submit}
        >
          Confirm <span aria-hidden="true">↵</span>
        </button>
      ) : null}
    </>
  );
}

export default function Home() {
  const [answers, setAnswers] = useState<Answers>({});
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asked = useRef(false);
  // The active question owns the number keys; the stage owns the rest.
  const questionKeys = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  const registerKeys = useCallback(
    (h: ((e: KeyboardEvent) => boolean) | null) => {
      questionKeys.current = h;
    },
    [],
  );

  const queue = visibleQuestions(answers);
  const current = queue.find((q) => !isAnswered(q, answers));
  const answered = queue.filter((q) => isAnswered(q, answers));

  const reset = useCallback(() => {
    asked.current = false;
    setAnswers({});
    setRec(null);
    setError(null);
    setPending(false);
  }, []);

  const goBack = useCallback(() => {
    setRec(null);
    setError(null);
    asked.current = false;
    setAnswers((prev) => {
      const order = visibleQuestions(prev).filter((q) => isAnswered(q, prev));
      const last = order[order.length - 1];
      if (!last) return prev;
      const next = { ...prev };
      delete next[last.id];
      return next;
    });
  }, []);

  // Stage-level keys. Backspace steps back, Escape resets, the rest defers
  // to whichever question is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key === "Backspace") {
        if (document.activeElement instanceof HTMLInputElement) return;
        e.preventDefault();
        goBack();
        return;
      }
      if (questionKeys.current?.(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset, goBack]);

  // Once every visible question is answered, ask the backend to decide.
  useEffect(() => {
    if (current || rec || asked.current) return;
    asked.current = true;

    const problems = QUESTIONS.find((q) => q.id === "problems");
    const field = QUESTIONS.find((q) => q.id === "field");
    const product = QUESTIONS.find((q) => q.id === "product");

    const payload: RecommendRequest = {
      field: {
        id: answers.field?.selected[0] ?? "other",
        label: field && answers.field ? describeAnswer(field, answers.field) : "",
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
  }, [current, rec, answers]);

  return (
    <main className="stage">
      <div className="stub" aria-hidden="true">
        Olu — Build Intake / Unit D-01
      </div>

      <div className="stage-main">
        <header className="stage-head">
          <div className="head-left">
            <h1 className="stage-title">Build Intake</h1>
            <span className="label">[ Olu Supply Co. ]</span>
          </div>
          <div className="head-right">
            <span className="progress" aria-label={`${answered.length} of ${queue.length} answered`}>
              {queue.map((q, i) => (
                <span
                  key={q.id}
                  className={`progress-cell ${i < answered.length ? "progress-cell-on" : ""}`}
                />
              ))}
            </span>
            <span className="label status-live">
              <span className="status-dot" aria-hidden="true" />
              Live
            </span>
            <button type="button" className="reset" onClick={reset}>
              Reset ↺ [Esc]
            </button>
          </div>
        </header>

        <div className="stage-body">
          <section className="col-intake">
            <span className="label">
              {current
                ? `Question ${answered.length + 1} / ${queue.length}`
                : "Intake complete"}
            </span>

            <p className="prompt">
              {current
                ? current.prompt
                : "That's everything I need — the verdict is on the right."}
            </p>

            {current ? (
              <QuestionBlock
                key={current.id}
                question={current}
                registerKeys={registerKeys}
                onAnswer={(a) =>
                  setAnswers((prev) => ({ ...prev, [current.id]: a }))
                }
              />
            ) : (
              <div className="dots" aria-hidden="true" />
            )}

            <div className="legend">
              <span className="label">[1-7] Select</span>
              <span className="label">[↵] Confirm</span>
              <span className="label">[⌫] Back</span>
              <span className="label">[Esc] Reset</span>
            </div>
          </section>

          <section className="col-dossier" aria-live="polite">
            <span className="label label-ink">[ Dossier ]</span>

            <div style={{ display: "grid", gap: "0.875rem", alignContent: "start", minHeight: 0 }}>
              <div className="dossier">
                {QUESTIONS.map((q) => {
                  const shown = queue.some((v) => v.id === q.id);
                  const done = isAnswered(q, answers);
                  return (
                    <div className="dossier-row" key={q.id}>
                      <span className="label">{q.id}</span>
                      <span
                        className={`dossier-value ${done ? "" : "dossier-await"}`}
                      >
                        {done
                          ? describeAnswer(q, answers[q.id]!)
                          : shown
                            ? "Awaiting…"
                            : "Not applicable"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {pending ? (
                <div className="typing" aria-label="Agent is deciding">
                  <span className="typing-block" />
                  <span className="typing-block" />
                  <span className="typing-block" />
                </div>
              ) : null}

              {rec ? (
                <>
                  <VerdictCard rec={rec} />
                  {rec.email ? <EmailStub email={rec.email} /> : null}
                  {error ? (
                    <span className="label">{`/// Routed locally — ${error}`}</span>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
