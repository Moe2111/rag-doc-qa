"use client";

import { useEffect, useRef, useState } from "react";

type Doc = { name: string; chunks: number };

type Turn = {
  question: string;
  answer: string;
  sources: string[];
};

const STARTERS = [
  "What is this document about?",
  "Summarise the main argument",
  "What are the key findings?",
];

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null);
  const endOfThread = useRef<HTMLDivElement>(null);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // The index is shared across visitors. Default to searching only what this
  // session uploaded, or "what are the key findings?" answers from a stranger's
  // document that happens to match more strongly.
  const [onlyMine, setOnlyMine] = useState(true);

  // Keep the newest answer in view as the thread grows.
  useEffect(() => {
    endOfThread.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, asking]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/ingest", { method: "POST", body });

      // A platform-level failure (504 timeout, 413 too large) returns an HTML
      // page, not our JSON. Parse defensively so the status still surfaces.
      let data: { error?: string; name?: string; chunks?: number } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON response */
      }

      if (!res.ok || typeof data.name !== "string") {
        setUploadError(data.error ?? `Upload failed (HTTP ${res.status})`);
        return;
      }
      const name = data.name;

      // Re-uploading the same filename overwrites its chunks in the index,
      // so replace rather than append to keep this list truthful.
      setDocs((prev) => [
        ...prev.filter((d) => d.name !== name),
        { name, chunks: data.chunks ?? 0 },
      ]);
    } catch {
      setUploadError("Could not reach the server");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || asking) return;

    setAsking(true);
    setAskError(null);
    setQuestion("");

    try {
      const scoped = onlyMine && docs.length > 0;

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          ...(scoped ? { sources: docs.map((d) => d.name) } : {}),
        }),
      });

      let data: { error?: string; answer?: string; source?: string[] } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON response */
      }

      if (!res.ok) {
        setAskError(data.error ?? `Query failed (HTTP ${res.status})`);
        setQuestion(trimmed);
        return;
      }

      setTurns((prev) => [
        ...prev,
        {
          question: trimmed,
          answer: data.answer ?? "",
          sources: data.source ?? [],
        },
      ]);
    } catch {
      setAskError("Could not reach the server");
      setQuestion(trimmed);
    } finally {
      setAsking(false);
    }
  }

  const started = turns.length > 0 || asking;

  return (
    <div className="flex flex-1 justify-center bg-stone-50 px-4 pb-32 pt-12 dark:bg-neutral-950 sm:px-6">
      <main className="flex w-full max-w-2xl flex-col gap-10">
        {/* Header */}
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-5 w-1 rounded-full bg-teal-700 dark:bg-teal-500"
            />
            <h1 className="text-[1.75rem] font-semibold leading-none tracking-tight text-neutral-900 dark:text-neutral-50">
              Document Q&amp;A
            </h1>
          </div>
          <p className="text-[0.9375rem] leading-6 text-neutral-600 dark:text-neutral-400">
            Ask questions about your own documents and get answers built{" "}
            <span className="text-neutral-900 dark:text-neutral-100">
              only from what they actually say
            </span>{" "}
            — never from the model&rsquo;s general knowledge.
          </p>
        </header>

        {/* How it works — only before the first question */}
        {!started && (
          <section className="grid gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 dark:border-neutral-800 dark:bg-neutral-800 sm:grid-cols-3">
            {[
              {
                n: "1",
                title: "Upload",
                body: "A PDF, TXT, or Markdown file. It's split into passages and indexed by meaning.",
              },
              {
                n: "2",
                title: "Ask",
                body: "Your question is matched against those passages — by meaning, not keywords.",
              },
              {
                n: "3",
                title: "Read the citation",
                body: "The answer names the file it came from, so you can check it.",
              },
            ].map((step) => (
              <div
                key={step.n}
                className="flex flex-col gap-1.5 bg-white p-4 dark:bg-neutral-900"
              >
                <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-teal-800 dark:text-teal-500">
                  {step.n}. {step.title}
                </span>
                <p className="text-[0.8125rem] leading-5 text-neutral-600 dark:text-neutral-400">
                  {step.body}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* Upload */}
        <section className="flex flex-col gap-3">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && !uploading) handleUpload(file);
            }}
            className={`group flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-6 py-8 text-center transition-colors ${
              dragging
                ? "border-teal-600 bg-teal-50/60 dark:border-teal-500 dark:bg-teal-950/30"
                : "border-neutral-300 bg-white hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:border-neutral-700"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.txt,.md"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
              className="sr-only"
            />
            {uploading ? (
              <>
                <Dots />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  Extracting, splitting, and indexing…
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-500">
                  A few seconds for a short file, longer for a large PDF
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Drop a file here, or click to browse
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-500">
                  PDF, TXT, or MD · text-based files only (scanned pages
                  won&rsquo;t work)
                </span>
              </>
            )}
          </label>

          {uploadError && (
            <p className="text-sm text-red-700 dark:text-red-400">
              {uploadError}
            </p>
          )}

          {docs.length > 0 && (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-wrap gap-2">
                {docs.map((doc) => (
                  <li
                    key={doc.name}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white py-1.5 pl-3 pr-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <span className="max-w-[16rem] truncate text-neutral-800 dark:text-neutral-200">
                      {doc.name}
                    </span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[0.6875rem] tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {doc.chunks} passages
                    </span>
                  </li>
                ))}
              </ul>

              <label className="flex cursor-pointer items-start gap-2.5 text-[0.8125rem] leading-5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-teal-700 dark:accent-teal-500"
                />
                <span>
                  Search only the {docs.length === 1 ? "file" : "files"} I
                  uploaded.{" "}
                  <span className="text-neutral-500 dark:text-neutral-500">
                    Uncheck to search every document in this shared demo index.
                  </span>
                </span>
              </label>
            </div>
          )}
        </section>

        {/* What to expect — only before the first question */}
        {!started && (
          <section className="flex flex-col gap-2.5 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/40">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              What to expect
            </h2>
            <ul className="flex flex-col gap-2 text-[0.8125rem] leading-5 text-neutral-600 dark:text-neutral-400">
              <li>
                <span className="text-neutral-800 dark:text-neutral-200">
                  Answers take a few seconds.
                </span>{" "}
                Each question is converted to a vector, matched against stored
                passages, and sent to Claude with those passages as context.
              </li>
              <li>
                <span className="text-neutral-800 dark:text-neutral-200">
                  It will refuse rather than guess.
                </span>{" "}
                Ask something your documents don&rsquo;t cover and it says so,
                even when the model knows the answer perfectly well. That&rsquo;s
                the whole point.
              </li>
              <li>
                <span className="text-neutral-800 dark:text-neutral-200">
                  This is a shared public demo.
                </span>{" "}
                Everything uploaded goes into one index. Questions are scoped to
                your own uploads by default, but the files themselves stay
                searchable by others — don&rsquo;t upload anything private.
              </li>
            </ul>
          </section>
        )}

        {/* Conversation */}
        <section className="flex flex-col gap-8">
          {!started && docs.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[0.6875rem] uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
                Try asking
              </span>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[0.8125rem] text-neutral-700 transition-colors hover:border-teal-600 hover:text-teal-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-teal-500 dark:hover:text-teal-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, i) => (
            <article key={i} className="flex flex-col gap-3.5">
              <h2 className="text-[0.9375rem] font-semibold leading-6 text-neutral-900 dark:text-neutral-100">
                {turn.question}
              </h2>

              <div className="border-l-2 border-neutral-200 pl-4 dark:border-neutral-800">
                <p className="whitespace-pre-wrap text-[0.9375rem] leading-7 text-neutral-700 dark:text-neutral-300">
                  {turn.answer}
                </p>

                {turn.sources.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <span className="text-[0.6875rem] uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
                      Source
                    </span>
                    {turn.sources.map((source) => (
                      <span
                        key={source}
                        className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-900 ring-1 ring-inset ring-teal-600/15 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-400/20"
                      >
                        {source}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}

          {asking && (
            <div className="flex items-center gap-2.5">
              <Dots />
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                Searching your documents…
              </span>
            </div>
          )}

          {askError && (
            <p className="text-sm text-red-700 dark:text-red-400">{askError}</p>
          )}

          <div ref={endOfThread} />
        </section>

        <footer className="text-xs text-neutral-400 dark:text-neutral-600">
          Next.js · Claude · Voyage embeddings · Pinecone · S3 ·{" "}
          <a
            href="https://github.com/Moe2111/rag-doc-qa"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-400"
          >
            source
          </a>
        </footer>
      </main>

      {/* Ask */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent px-4 pb-6 pt-10 dark:from-neutral-950 dark:via-neutral-950 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="mx-auto flex w-full max-w-2xl gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              docs.length === 0
                ? "Upload a document first…"
                : "Ask a question about your documents…"
            }
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-[0.9375rem] text-neutral-900 shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-teal-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={asking || question.trim() === ""}
            className="shrink-0 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:bg-teal-600 dark:hover:bg-teal-500 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-600"
        />
      ))}
    </span>
  );
}
