"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import {
  formatBytes,
  isBuildResponse,
  isChatResponse,
  mockReply,
  skeletonFor,
  STEP_LABEL,
  turnId,
  type BuildRequest,
  type BuildStep,
  type ChatRequest,
  type ChatTurn,
  type ImportedFile,
} from "@/lib/build";
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

type Phase = "intake" | "import" | "building" | "chat";

interface RunResult {
  cart: {
    email: string;
    items: string;
    value: string;
    currency: string;
    ageLabel: string;
    source: "shopify" | "mock";
  };
  email: { subject: string; body: string };
  status: "sent";
}

type Entry = "landing" | "manual" | "site";

interface SiteAnalysis {
  store: {
    url: string;
    title: string;
    description: string;
    platform: string;
    category: string;
    sells: string[];
    priceSignal: string;
  };
  evidence: Array<{ label: string; value: string }>;
  summary: string;
  recommendation: { automationId: "recovery"; name: string; reason: string };
  source: "ai" | "signals";
  concerns: string;
}

/** One automation costs one full wallet. */
const TOKEN_BALANCE = 100;
/** Delay between skeleton steps appearing. */
const STEP_MS = 420;
/** Beat after the last step before the chat opens. */
const BUILD_TAIL_MS = 500;

/* -------------------------------------------------------------------------- */

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
    </figure>
  );
}

/**
 * The build moment — calm and legible. Plain-language steps complete one at a
 * time, then it resolves to the built automation. No flashing, just a clear
 * "here's what's happening" sequence.
 */
function SynthesisReactor({
  code,
  name,
}: {
  code: string;
  name: string;
}) {
  const TASKS = [
    "Reading the abandoned cart",
    "Understanding what to say",
    "Writing the recovery email",
    "Wiring the send + follow-up",
  ];
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (done >= TASKS.length) return;
    const t = setTimeout(() => setDone((n) => n + 1), 620);
    return () => clearTimeout(t);
  }, [done, TASKS.length]);

  const complete = done >= TASKS.length;

  return (
    <div className="synth" aria-hidden="true">
      <div className="synth-head">
        <span className="label">[ Building ]</span>
        <span className="label">{complete ? "Ready" : "Working…"}</span>
      </div>

      <ol className="synth-tasks">
        {TASKS.map((t, i) => {
          const state = i < done ? "done" : i === done ? "active" : "wait";
          return (
            <li className={`synth-task synth-task-${state}`} key={t}>
              <span className="synth-tick">{i < done ? "✓" : "○"}</span>
              <span>{t}</span>
            </li>
          );
        })}
      </ol>

      {complete ? (
        <div className="synth-result">
          <span className="label">[ {code} ]</span>
          <span className="synth-result-name">{name}</span>
          <span className="synth-stamp">Built &amp; ready</span>
        </div>
      ) : null}
    </div>
  );
}

function LandingScreen({
  onManual,
  onSite,
}: {
  onManual: () => void;
  onSite: () => void;
}) {
  return (
    <main className="stage">
      <div className="stub" aria-hidden="true">
        Agent² — Build Intake / Unit D-01
      </div>
      <div className="landing">
        <div className="landing-head">
          <h1 className="landing-title">Agent²</h1>
          <p className="landing-sub">
            The agent that finds what to automate in your store — and builds it.
          </p>
        </div>
        <div className="landing-paths">
          <button type="button" className="path-card" onClick={onSite}>
            <span className="label">Path A · Automated</span>
            <span className="path-name">Analyze my website</span>
            <span className="path-note">
              Paste your store URL. The agent reads the live site, works out what
              you sell, and finds the highest-value automation.
            </span>
            <span className="path-go">Paste a URL →</span>
          </button>
          <button type="button" className="path-card" onClick={onManual}>
            <span className="label">Path B · Manual</span>
            <span className="path-name">Describe my store</span>
            <span className="path-note">
              Answer three quick questions and the agent routes you to the right
              automation.
            </span>
            <span className="path-go">Answer questions →</span>
          </button>
        </div>
      </div>
    </main>
  );
}

function SitePanel({
  url,
  concerns,
  onUrl,
  onConcerns,
  onAnalyze,
  analyzing,
  result,
  error,
  onProceed,
  onManual,
}: {
  url: string;
  concerns: string;
  onUrl: (v: string) => void;
  onConcerns: (v: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  result: SiteAnalysis | null;
  error: string | null;
  onProceed: () => void;
  onManual: () => void;
}) {
  if (analyzing) {
    return (
      <div className="site-analyzing" role="status">
        <div className="typing" aria-label="Analyzing">
          <span className="typing-block" />
          <span className="typing-block" />
          <span className="typing-block" />
        </div>
        <span className="label">Fetching the live storefront &amp; reading product signals…</span>
      </div>
    );
  }

  if (result) {
    return (
      <div className="site-result">
        <section className="site-readout" aria-label="Signals found on the live store">
          <div className="site-readout-head">
            <span className="label">[ Live store read ]</span>
            <span className="site-readout-title">{result.store.title}</span>
          </div>
          <dl className="site-evidence">
            {result.evidence.map((item) => (
              <div className="site-evidence-item" key={item.label}>
                <dt className="label">{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          {result.store.sells.length ? (
            <div className="site-products">
              <span className="label">Products seen</span>
              <div className="site-product-list">
                {result.store.sells.slice(0, 5).map((product) => (
                  <span className="site-product" key={product}>
                    {product}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        <p className="site-summary">{result.summary}</p>
        <figure className="verdict" style={{ margin: 0 }}>
          <div className="verdict-head">
            <span className="label">[ Recommended build ]</span>
            <span className="label">
              {result.source === "ai" ? "Live signals + AI" : "Live signals"}
            </span>
          </div>
          <div className="verdict-body">
            <span className="label">Build</span>
            <h2 className="verdict-name">{result.recommendation.name}</h2>
            <p className="verdict-reason">{result.recommendation.reason}</p>
          </div>
        </figure>
        <button type="button" className="confirm" onClick={onProceed}>
          Set up Cart Recovery <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  return (
    <div className="site-form">
      <label className="site-field">
        <span className="label">Store URL</span>
        <input
          className="other-input"
          type="url"
          value={url}
          placeholder="your-store.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) onAnalyze();
          }}
        />
      </label>
      <label className="site-field">
        <span className="label">What feels off? (optional)</span>
        <input
          className="other-input"
          value={concerns}
          placeholder="e.g. people add to cart but don't buy"
          onChange={(e) => onConcerns(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) onAnalyze();
          }}
        />
      </label>
      <button
        type="button"
        className="confirm"
        disabled={!url.trim()}
        onClick={onAnalyze}
      >
        Analyze my store <span aria-hidden="true">→</span>
      </button>
      {error ? (
        <div className="site-error">
          <span className="label">{error}</span>
          <button type="button" className="run-again" onClick={onManual}>
            Describe it manually instead →
          </button>
        </div>
      ) : null}
    </div>
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
        <span className="label">Agent² / D-01</span>
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

/** Real drag-and-drop. Files are read for name/size/type and never uploaded. */
function ImportPanel({
  files,
  onFiles,
  onBuild,
  automationName,
  cost,
}: {
  files: ImportedFile[];
  onFiles: (f: ImportedFile[]) => void;
  onBuild: () => void;
  automationName: string;
  cost: number;
}) {
  const [hot, setHot] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      const next = Array.from(list).map((f) => ({
        name: f.name,
        size: f.size,
        kind: f.type || f.name.split(".").pop()?.toUpperCase() || "FILE",
      }));
      onFiles(next);
    },
    [onFiles],
  );

  return (
    <>
      <div
        className={`dropzone ${hot ? "dropzone-hot" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setHot(true);
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHot(false);
          take(e.dataTransfer.files);
        }}
      >
        <span className="dropzone-title">Drop your data here</span>
        <span className="label">
          Orders · Products · Customers — CSV, XLSX, JSON
        </span>
        <span className="option-note">Or click to browse</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => take(e.target.files)}
        />
      </div>

      {files.length ? (
        <div className="manifest">
          {files.map((f) => (
            <div className="manifest-row" key={f.name}>
              <span className="label">[ OK ]</span>
              <span className="manifest-name">{f.name}</span>
              <span className="label">{formatBytes(f.size)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <button type="button" className="confirm" onClick={onBuild}>
        {files.length
          ? `Build ${automationName} — ${cost} tokens ↵`
          : `Skip — build ${automationName} anyway — ${cost} tokens ↵`}
      </button>
    </>
  );
}

function ChatPanel({
  turns,
  pending,
  onSend,
}: {
  turns: ChatTurn[];
  pending: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  function send() {
    const text = draft.trim();
    if (!text || pending) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {turns.map((t) => (
          <article
            key={t.id}
            className={`turn ${t.role === "user" ? "turn-user" : "turn-agent"}`}
          >
            <span className="label">{t.role === "user" ? "You" : "Agent →"}</span>
            <p className="turn-body" style={{ margin: 0 }}>
              {t.content}
            </p>
          </article>
        ))}
        {pending ? (
          <div className="typing" aria-label="Agent is typing">
            <span className="typing-block" />
            <span className="typing-block" />
            <span className="typing-block" />
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          value={draft}
          placeholder="Ask about the build"
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="send" type="submit" disabled={pending || !draft.trim()}>
          Send <span aria-hidden="true">↗</span>
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function Home() {
  const [entry, setEntry] = useState<Entry>("landing");
  const [answers, setAnswers] = useState<Answers>({});
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [phase, setPhase] = useState<Phase>("intake");
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Path A — analyze a real website.
  const [siteUrl, setSiteUrl] = useState("");
  const [siteConcerns, setSiteConcerns] = useState("");
  const [siteResult, setSiteResult] = useState<SiteAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);

  const [files, setFiles] = useState<ImportedFile[]>([]);
  const [steps, setSteps] = useState<BuildStep[]>([]);
  const [shown, setShown] = useState(0);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [replying, setReplying] = useState(false);
  const [tokens, setTokens] = useState(TOKEN_BALANCE);

  // "See it run" — plays the built automation once against a real cart.
  const [run, setRun] = useState<RunResult | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "done">("idle");
  const [runStep, setRunStep] = useState(0);

  const seeItRun = useCallback(async () => {
    if (runState === "running") return;
    setRun(null);
    setRunState("running");
    setRunStep(0);
    let data: RunResult | null = null;
    try {
      const res = await fetch("/api/run-recovery");
      if (res.ok) data = (await res.json()) as RunResult;
    } catch {
      // fall through — handled below
    }
    // Walk the steps as if the automation is firing, then reveal the result.
    const total = steps.length || 7;
    for (let i = 1; i <= total; i++) {
      await new Promise((r) => setTimeout(r, 260));
      setRunStep(i);
    }
    await new Promise((r) => setTimeout(r, 300));
    if (data) {
      setRun(data);
      setRunState("done");
    } else {
      setRunState("idle");
    }
  }, [runState, steps.length]);

  const asked = useRef(false);
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
  const auto = rec ? automationById(rec.chosen.automationId) : null;

  const reset = useCallback(() => {
    asked.current = false;
    setEntry("landing");
    setAnswers({});
    setRec(null);
    setError(null);
    setDeciding(false);
    setPhase("intake");
    setFiles([]);
    setSteps([]);
    setShown(0);
    setTurns([]);
    setReplying(false);
    setTokens(TOKEN_BALANCE);
    setSiteUrl("");
    setSiteConcerns("");
    setSiteResult(null);
    setAnalyzing(false);
    setSiteError(null);
    // Clear the "See it run" result too, or a second run-through shows the
    // previous run's cart with no button to fire it live.
    setRun(null);
    setRunState("idle");
    setRunStep(0);
  }, []);

  const analyzeSite = useCallback(async () => {
    if (!siteUrl.trim()) return;
    setSiteError(null);
    setSiteResult(null);
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: siteUrl.trim(), concerns: siteConcerns }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSiteError(data.error ?? "Couldn't analyze that site.");
      } else {
        setSiteResult(data as SiteAnalysis);
        setSiteUrl((data as SiteAnalysis).store.url);
      }
    } catch {
      setSiteError("Couldn't reach the analyzer. Try again, or describe it manually.");
    } finally {
      setAnalyzing(false);
    }
  }, [siteUrl, siteConcerns]);

  // Both paths converge here: route to Cart Recovery and enter the build flow.
  const proceedToRecovery = useCallback(() => {
    const recoveryAnswers: Answers = {
      field: { selected: ["fashion"] },
      problems: { selected: ["abandonment"] },
      product: { selected: ["oneoff"] },
    };
    setRec(mockRecommendation(recoveryAnswers));
    setPhase("import");
  }, []);

  const goBack = useCallback(() => {
    setRec(null);
    setError(null);
    asked.current = false;
    setPhase("intake");
    setSteps([]);
    setShown(0);
    setTurns([]);
    // Stepping back un-buys the automation; the wallet is refunded.
    setTokens(TOKEN_BALANCE);
    setRun(null);
    setRunState("idle");
    setRunStep(0);
    setAnswers((prev) => {
      const order = visibleQuestions(prev).filter((q) => isAnswered(q, prev));
      const last = order[order.length - 1];
      if (!last) return prev;
      const next = { ...prev };
      delete next[last.id];
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key === "Backspace") {
        // Backspace must delete text, not navigate, while typing anywhere.
        const el = document.activeElement;
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        goBack();
        return;
      }
      if (questionKeys.current?.(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset, goBack]);

  // Intake finished — ask the backend to decide, then move to import.
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

    setDeciding(true);
    (async () => {
      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
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
        setDeciding(false);
        setPhase("import");
      }
    })();
  }, [current, rec, answers]);

  const startBuild = useCallback(() => {
    if (!rec) return;
    setPhase("building");
    setShown(0);

    const payload: BuildRequest = {
      automationId: rec.chosen.automationId,
      files: files.map((f) => ({ name: f.name, size: f.size, kind: f.kind })),
    };

    (async () => {
      let plan = skeletonFor(rec.chosen.automationId);
      try {
        const res = await fetch("/api/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data: unknown = await res.json();
          if (isBuildResponse(data) && data.steps.length) plan = data.steps;
        }
      } catch {
        // keep the local skeleton — the build must never dead-end on stage
      }
      setSteps(plan);
    })();
  }, [rec, files]);

  // Spend the wallet while the skeleton assembles, so cost and build read as
  // one action. The rate is derived from this skeleton's own length — a fixed
  // rate would strand the counter mid-count on shorter builds.
  useEffect(() => {
    if (phase !== "building" || !steps.length) return;
    const total = steps.length * STEP_MS + BUILD_TAIL_MS;
    const tick = Math.max(10, Math.floor(total / TOKEN_BALANCE));
    const id = setInterval(() => setTokens((t) => (t <= 0 ? 0 : t - 1)), tick);
    return () => clearInterval(id);
  }, [phase, steps]);

  // Reveal the skeleton a step at a time, then open the chat.
  useEffect(() => {
    if (phase !== "building" || !steps.length) return;
    if (shown >= steps.length) {
      const t = setTimeout(() => {
        // The build is bought outright: never leave the wallet mid-count,
        // whatever the timers actually did.
        setTokens(0);
        setPhase("chat");
        setTurns([
          {
            id: turnId(),
            role: "agent",
            content: `Skeleton's up — ${steps.length} steps, wired to the data you imported. That's your hundred tokens spent. Ask me anything about it, or tell me what to change.`,
          },
        ]);
      }, BUILD_TAIL_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [phase, steps, shown]);

  const send = useCallback(
    (text: string) => {
      if (!rec) return;
      const history = turns.map(({ role, content }) => ({ role, content }));
      setTurns((prev) => [
        ...prev,
        { id: turnId(), role: "user", content: text },
      ]);
      setReplying(true);

      const payload: ChatRequest = {
        automationId: rec.chosen.automationId,
        message: text,
        history,
      };

      (async () => {
        const fallback = () =>
          mockReply(text, auto?.name ?? "this automation");
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(String(res.status));
          const data: unknown = await res.json();
          const reply = isChatResponse(data) ? data.reply : fallback();
          setTurns((prev) => [
            ...prev,
            { id: turnId(), role: "agent", content: reply },
          ]);
        } catch {
          // Scripted fallback: the pitch's last beat must never dead-end.
          setTurns((prev) => [
            ...prev,
            { id: turnId(), role: "agent", content: fallback() },
          ]);
        } finally {
          setReplying(false);
        }
      })();
    },
    [rec, turns, auto],
  );

  const siteIntake = entry === "site" && phase === "intake";

  const stageLabel = siteIntake
    ? siteResult
      ? "Analysis / Verdict"
      : analyzing
        ? "Analyzing…"
        : "Website / Step 1 of 1"
    : phase === "intake"
      ? current
        ? `Question ${answered.length + 1} / ${queue.length}`
        : "Deciding"
      : phase === "import"
        ? "Import / Step 1 of 1"
        : phase === "building"
          ? `Building — ${shown} / ${steps.length || "…"}`
          : "Live build";

  const prompt = siteIntake
    ? siteResult
      ? "Here's what I found — and where the money's leaking."
      : "Paste your store's URL and I'll read the live site."
    : phase === "intake"
      ? current?.prompt ?? "That's everything I need."
      : phase === "import"
        ? "Import your data so I build this against your real orders — not a guess."
        : phase === "building"
          ? `Wiring up ${auto?.name ?? "the automation"}…`
          : `${auto?.name ?? "It"} is built. Talk to it.`;

  if (entry === "landing") {
    return (
      <LandingScreen
        onManual={() => setEntry("manual")}
        onSite={() => setEntry("site")}
      />
    );
  }

  return (
    <main className="stage">
      <div className="stub" aria-hidden="true">
        Agent² — Build Intake / Unit D-01
      </div>

      <div className="stage-main">
        <header className="stage-head">
          <div className="head-left">
            <h1 className="stage-title">
              {phase === "chat" ? "Live Build" : "Build Intake"}
            </h1>
            <span className="label">[ Agent² ]</span>
          </div>
          <div className="head-right">
            <div
              className={`tokens ${tokens === 0 ? "tokens-spent" : ""}`}
              aria-label={`${tokens} of ${TOKEN_BALANCE} tokens remaining`}
            >
              <span className="label">Tokens</span>
              <data className="token-value">{tokens}</data>
              <span className="token-bar" aria-hidden="true">
                <span
                  className="token-fill"
                  style={{
                    width: `${(tokens / TOKEN_BALANCE) * 100}%`,
                    display: "block",
                  }}
                />
              </span>
            </div>
            <span
              className="progress"
              aria-label={`${answered.length} of ${queue.length} answered`}
            >
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
            <span className="label">{stageLabel}</span>
            <p className="prompt">{prompt}</p>

            {entry === "site" && phase === "intake" ? (
              <SitePanel
                url={siteUrl}
                concerns={siteConcerns}
                onUrl={setSiteUrl}
                onConcerns={setSiteConcerns}
                onAnalyze={analyzeSite}
                analyzing={analyzing}
                result={siteResult}
                error={siteError}
                onProceed={proceedToRecovery}
                onManual={() => {
                  setSiteError(null);
                  setEntry("manual");
                }}
              />
            ) : phase === "intake" && current ? (
              <QuestionBlock
                key={current.id}
                question={current}
                registerKeys={registerKeys}
                onAnswer={(a) =>
                  setAnswers((prev) => ({ ...prev, [current.id]: a }))
                }
              />
            ) : phase === "import" ? (
              <ImportPanel
                files={files}
                onFiles={setFiles}
                onBuild={startBuild}
                automationName={auto?.name ?? "it"}
                cost={TOKEN_BALANCE}
              />
            ) : phase === "building" ? (
              <SynthesisReactor
                code={auto?.code ?? "D-01"}
                name={auto?.name ?? "the automation"}
              />
            ) : phase === "chat" ? (
              <ChatPanel turns={turns} pending={replying} onSend={send} />
            ) : (
              <div className="dots" aria-hidden="true" />
            )}

            <div className="legend">
              {phase === "intake" ? (
                <>
                  <span className="label">[1-7] Select</span>
                  <span className="label">[↵] Confirm</span>
                </>
              ) : (
                <span className="label">[↵] Send</span>
              )}
              <span className="label">[⌫] Back</span>
              <span className="label">[Esc] Reset</span>
            </div>
          </section>

          <section className="col-dossier" aria-live="polite">
            <span className="label label-ink">
              {phase === "building" || phase === "chat"
                ? "[ Skeleton ]"
                : "[ Dossier ]"}
            </span>

            <div
              style={{
                display: "grid",
                gap: "0.625rem",
                alignContent: "start",
                minHeight: 0,
              }}
            >
              {phase === "building" || phase === "chat" ? (
                <>
                  {auto ? (
                    <div className="verdict-slim">
                      <span className="label">[ {auto.code} ]</span>
                      <span className="verdict-slim-name">{auto.name}</span>
                    </div>
                  ) : null}
                  <div className="steps">
                    {steps.slice(0, shown).map((s, i) => {
                      const firing = runState === "running" && runStep === i + 1;
                      const ran = runState !== "idle" && runStep > i;
                      return (
                        <div
                          className={`step step-${s.kind} ${firing ? "step-firing" : ""} ${ran ? "step-ran" : ""}`}
                          key={i}
                        >
                          <span className="step-kind">{STEP_LABEL[s.kind]}</span>
                          <span>
                            <span className="step-title">{s.title}</span>
                            <br />
                            <span className="step-detail">{s.detail}</span>
                          </span>
                          {ran ? <span className="step-check">✓</span> : null}
                        </div>
                      );
                    })}
                  </div>

                  {phase === "chat" ? (
                    <div className="runbox">
                      {runState === "idle" ? (
                        <button
                          type="button"
                          className="run-btn"
                          onClick={seeItRun}
                        >
                          ▶ See it run — on a real cart
                        </button>
                      ) : null}

                      {runState === "running" ? (
                        <div className="run-status label">
                          ● Executing on a live abandoned cart…
                        </div>
                      ) : null}

                      {runState === "done" && run ? (
                        <div className="run-result">
                          <div className="run-cart">
                            <span className="label">[ Abandoned cart ]</span>
                            <span className="run-cart-val">{run.cart.value}</span>
                            <span className="run-cart-items">{run.cart.items}</span>
                            <span className="label">
                              {run.cart.email} · {run.cart.ageLabel} ·{" "}
                              {run.cart.source === "shopify" ? "live Shopify" : "sample"}
                            </span>
                          </div>

                          <div className="run-email">
                            <div className="run-email-head">
                              <span className="label">[ Email it wrote ]</span>
                              <span className="label">Claude ✎</span>
                            </div>
                            <div className="run-email-subj">{run.email.subject}</div>
                            <p className="run-email-body">{run.email.body}</p>
                            <div className="run-sent">
                              SENT ✓ → {run.cart.email} · logged
                            </div>
                          </div>

                          <button
                            type="button"
                            className="run-again"
                            onClick={seeItRun}
                          >
                            ↻ Run again
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {files.length ? (
                    <div className="manifest">
                      <div className="manifest-row">
                        <span className="label">[ Imported ]</span>
                        <span className="label">{files.length} file(s)</span>
                        <span className="label">
                          {formatBytes(
                            files.reduce((s, f) => s + f.size, 0),
                          )}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="dossier">
                    {QUESTIONS.map((q) => {
                      const shownQ = queue.some((v) => v.id === q.id);
                      const done = isAnswered(q, answers);
                      return (
                        <div className="dossier-row" key={q.id}>
                          <span className="label">{q.id}</span>
                          <span
                            className={`dossier-value ${done ? "" : "dossier-await"}`}
                          >
                            {done
                              ? describeAnswer(q, answers[q.id]!)
                              : shownQ
                                ? "Awaiting…"
                                : "Not applicable"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {deciding ? (
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
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
