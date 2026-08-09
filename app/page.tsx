"use client";

import { useRef, useState } from "react";

type Doc = { name: string; chunks: number };

type Turn = {
  question: string;
  answer: string;
  sources: string[];
};

export default function Home() {
  const fileInput = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

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

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || asking) return;

    setAsking(true);
    setAskError(null);
    setQuestion("");

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
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

  return (
    <div className="flex flex-1 justify-center bg-stone-50 px-4 pb-28 pt-12 dark:bg-neutral-950 sm:px-6">
      <main className="flex w-full max-w-2xl flex-col gap-10">
        {/* Header */}
        <header className="flex flex-col gap-2.5">
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
            Upload a PDF, TXT, or Markdown file and ask questions about it.
            Every answer is drawn only from what your documents actually say —
            with the source cited, or an honest{" "}
            <span className="text-neutral-800 dark:text-neutral-200">
              &ldquo;I don&rsquo;t know&rdquo;
            </span>{" "}
            when they don&rsquo;t cover it.
          </p>
        </header>

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
                  Extracting, chunking, and indexing…
                </span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Drop a file here, or click to browse
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-500">
                  PDF, TXT, or MD
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
                    {doc.chunks}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Conversation */}
        <section className="flex flex-col gap-8">
          {turns.length === 0 && !asking && (
            <div className="rounded-xl border border-neutral-200 bg-white px-5 py-6 dark:border-neutral-800 dark:bg-neutral-900/40">
              <p className="text-sm leading-6 text-neutral-500 dark:text-neutral-400">
                {docs.length === 0
                  ? "Upload a document to get started."
                  : "Ask something about your documents below."}
              </p>
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
        </section>
      </main>

      {/* Ask */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent px-4 pb-6 pt-10 dark:from-neutral-950 dark:via-neutral-950 sm:px-6">
        <form
          onSubmit={handleAsk}
          className="mx-auto flex w-full max-w-2xl gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your documents…"
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
