# rag-doc-qa v2 — Architecture Spec

**Purpose of this document:** implementation brief for extending the existing app.
Read this fully before writing code. Ask me before making any decision marked
**[DECISION]**.

---

## 1. Why we're doing this

The app works, but the resume story is narrow: it reads as "AI project." Backend and
full-stack job descriptions in this market ask for **relational databases + SQL**,
**authentication**, **Python (FastAPI/Django)**, and **containerized services**. The
current stack has none of those.

v2 adds them *without* rewriting what works. The RAG pipeline logic stays; we add a
persistence layer, an auth layer, and extract one pipeline into a separate Python
service so the project demonstrates a multi-service architecture.

**Non-goals:** do not rewrite the retrieval logic, do not change the embedding model or
Pinecone index (voyage-3-lite, 512 dims, cosine — this must not change), do not
redesign the UI beyond what auth requires.

---

## 2. Current state (v1)

- **Next.js 16 (App Router), TypeScript**, Tailwind v4. No `src/` dir — `app/` is at root.
- `POST /api/ingest` — upload file → extract text (pdf-parse v2, Node CanvasFactory
  passed explicitly for serverless) → chunk at 1500 chars / 200 overlap → batch-embed
  via Voyage → upsert to Pinecone + store original in S3.
- `POST /api/query` — embed question → Pinecone cosine top-k=4 → grounded prompt →
  Claude (claude-sonnet-5) → answer + sources.
- Deterministic chunk IDs (`<filename>-<index>`) so re-uploads overwrite, not duplicate.
- Deployed on Vercel. Single shared Pinecone namespace, no users, no auth, no database.

---

## 3. Target state (v2)

```
                     ┌───────────────────────────────┐
   Browser  ────────▶│  Next.js app (Vercel)         │
                     │  - React UI + auth pages      │
                     │  - /api/query  (unchanged      │
                     │    logic, now user-scoped)    │
                     │  - /api/documents (CRUD)      │
                     └───┬───────────┬───────────┬───┘
                         │           │           │
              ┌──────────▼──┐  ┌─────▼─────┐  ┌──▼──────────────┐
              │ PostgreSQL  │  │ Pinecone  │  │ FastAPI service │
              │ (Neon)      │  │ (per-user │  │ (ingestion)     │
              │ users, docs,│  │ namespace)│  │  Python, Docker │
              │ queries     │  └───────────┘  │  → S3 + Pinecone│
              └─────────────┘                 └─────────────────┘
```

Three additions: **(A)** Postgres for relational data, **(B)** auth with per-user data
isolation, **(C)** ingestion extracted into a Python FastAPI service.

---

## 4. Part A — PostgreSQL

**Provider:** Neon (free tier, serverless Postgres, works well with Vercel).
**ORM:** Prisma (TypeScript-native, good migrations, readable schema — and the schema
file doubles as documentation for interviews).

### Schema

```prisma
model User {
  id        String     @id @default(cuid())
  email     String     @unique
  name      String?
  createdAt DateTime   @default(now())
  documents Document[]
  queries   Query[]
}

model Document {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  filename     String
  s3Key        String
  sizeBytes    Int
  chunkCount   Int
  status       String   @default("pending")  // pending | processing | ready | failed
  errorMessage String?
  createdAt    DateTime @default(now())
  queries      Query[]

  @@index([userId])
}

model Query {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  documentId String?
  document   Document? @relation(fields: [documentId], references: [id], onDelete: SetNull)
  question   String
  answer     String
  sources    Json      // [{ filename, chunkId, score }]
  latencyMs  Int
  createdAt  DateTime  @default(now())

  @@index([userId, createdAt])
}
```

**Notes on the design (these are the interview talking points, keep them true):**
- `User → Document` and `User → Query` are one-to-many; `Document → Query` is optional
  (a query may span all documents).
- Indexes on `userId` because every read is scoped by user — that's the access pattern.
- `onDelete: Cascade` on documents/queries so deleting a user cleans up their rows.
- `sources` is `Json` because its shape is variable and never queried by field —
  a deliberate exception to normalization, not laziness.

### New endpoints
- `GET /api/documents` — list current user's documents (id, filename, status, chunkCount, createdAt).
- `DELETE /api/documents/:id` — delete from Postgres, S3, **and** Pinecone (delete
  vectors by ID prefix in that user's namespace). Must clean up all three or we leak.
- `GET /api/queries` — current user's query history, most recent first, paginated (limit 20).

`/api/query` additionally writes a `Query` row on every request (question, answer,
sources, latency).

---

## 5. Part B — Authentication

**[DECISION] Auth provider — pick one and tell me why:**
- **NextAuth.js (Auth.js)** with Google OAuth + Prisma adapter — free, self-hosted, and
  the session/adapter wiring is a genuinely good thing to have built once.
- **Clerk** — faster to integrate, generous free tier, less to explain in an interview.

Default to **NextAuth with the Prisma adapter** unless I say otherwise: it writes users
into our own Postgres, which keeps the schema above meaningful.

### Requirements
- Sign in with Google. No password handling — we are not storing credentials.
- Protect `/api/ingest`, `/api/query`, `/api/documents*`, `/api/queries` — return
  **401** with a JSON error when unauthenticated. Never rely on the UI hiding a route.
- Every DB read/write filters by the session user's id. **No endpoint may accept a
  `userId` from the request body** — always derive it server-side from the session.
  (This is the whole point; getting it wrong is the classic IDOR bug.)
- Unauthenticated visitors see a landing page with a sign-in button; the app UI is
  behind auth.

### Per-user data isolation in Pinecone
Use a **namespace per user**: `namespace = user.id`. Ingest writes into that namespace,
query reads only from it. This is the vector-DB equivalent of the `WHERE userId = ?`
filter and is the correct multi-tenant pattern here. Update both pipelines.

---

## 6. Part C — FastAPI ingestion service

**Why extract this:** ingestion is slow (parse → chunk → embed → upsert) and is the
natural seam for a separate service. It also adds Python + FastAPI + Docker to the
stack, and makes the project a genuine multi-service architecture instead of a monolith.

**Location:** new top-level folder `ingestion-service/` in the same repo (monorepo —
simpler to deploy and to demo than a second repo).

```
ingestion-service/
  app/
    main.py           # FastAPI app, routes
    chunking.py       # port of lib/chunk.ts — SAME 1500/200 params
    embeddings.py     # Voyage client — voyage-3-lite, output_dimension=512
    vectorstore.py    # Pinecone upsert, namespace-aware
    storage.py        # S3 upload (boto3)
    models.py         # pydantic request/response models
    config.py         # env via pydantic-settings
  tests/
    test_chunking.py  # chunk sizes, overlap, boundary cases
  Dockerfile
  requirements.txt
  README.md
```

### API
```
POST /ingest
  multipart/form-data: file, user_id, document_id
  → 202 { "document_id": "...", "status": "processing" }

GET /health → 200 { "status": "ok" }
```

### Behaviour
1. Validate file type (pdf, txt, md) and size (reject > 10 MB with 413).
2. Upload original to S3 (`{user_id}/{document_id}/{filename}`).
3. Extract text — `pypdf` for PDF, plain read otherwise.
4. Chunk — **must match the TS implementation exactly**: 1500 chars, 200 overlap,
   whitespace normalized. Port it faithfully; a mismatch changes retrieval behaviour.
5. Batch-embed via Voyage (`voyage-3-lite`, `input_type="document"`,
   `output_dimension=512`). Batch, do not parallelize — Voyage rate limits.
6. Upsert to Pinecone in namespace `user_id`, deterministic IDs
   `{document_id}-{index}`, metadata `{ text, filename, document_id }`.
7. Report status back so Next.js can update the `Document` row (see decision below).

**[DECISION] How the service reports completion — pick one:**
- Next.js polls `GET /ingest/status/{document_id}` (simplest, no shared secret needed
  beyond the call itself).
- The service writes directly to Postgres (needs the DB URL in a second place).
- The service calls a webhook back into Next.js (needs a shared secret).

Default to **polling** unless I say otherwise — fewest moving parts, easiest to demo.

### Service-to-service auth
Next.js sends a shared secret header `X-Internal-Token`; the service rejects anything
else with 401. Store as `INTERNAL_API_TOKEN` in both environments. Do not expose the
FastAPI service publicly without this check.

### Deployment
Dockerized, deployed to **Google Cloud Run** (scales to zero, free tier covers this,
and it adds GCP to the stack alongside AWS). Next.js still on Vercel.

---

## 7. Environment variables

Existing (unchanged): `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `PINECONE_API_KEY`,
`PINECONE_INDEX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`.

New in Next.js:
```
DATABASE_URL=                  # Neon Postgres connection string
NEXTAUTH_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
INGESTION_SERVICE_URL=         # Cloud Run URL
INTERNAL_API_TOKEN=
```

New in ingestion-service:
```
VOYAGE_API_KEY, PINECONE_API_KEY, PINECONE_INDEX,
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET,
INTERNAL_API_TOKEN
```

Update `.env.example` in both. Never commit real values. Confirm `.gitignore` still
covers `.env*`.

---

## 8. Build order

Do these as separate commits, in this order. **Stop after each phase so I can review
and test before you continue.**

1. **Phase 1 — Postgres.** Add Prisma, the schema above, migrations, and a Neon
   connection. Wire `/api/query` to write `Query` rows. Add `GET /api/documents` and
   `GET /api/queries`. No auth yet — hardcode a dev user id temporarily.
2. **Phase 2 — Auth.** NextAuth + Google + Prisma adapter. Protect all API routes.
   Replace the hardcoded user id with the session user everywhere. Add Pinecone
   per-user namespaces to both pipelines. Add sign-in/sign-out UI and a landing page.
3. **Phase 3 — Delete.** `DELETE /api/documents/:id` removing from Postgres, S3, and
   Pinecone. Add the UI for it. (Do this after auth so it's user-scoped from the start.)
4. **Phase 4 — FastAPI service.** Build and test it standalone (Docker, locally) before
   touching Next.js. Include the chunking tests.
5. **Phase 5 — Integration.** Point `/api/ingest` at the service, implement status
   polling, update the UI to show ingestion progress.
6. **Phase 6 — Deploy.** Cloud Run for the service, env vars in both places, verify the
   whole flow in production, update the README and architecture diagram.

---

## 9. Constraints and standards

- **Do not change** the embedding model, dimension (512), Pinecone metric, chunk size,
  or overlap. Retrieval behaviour must be identical to v1.
- TypeScript strict mode; no `any` unless genuinely unavoidable, with a comment.
- Python: type hints throughout, pydantic models for all request/response bodies.
- Every new API route: validate input, handle errors, return proper status codes
  (400 bad input, 401 unauthenticated, 403 wrong owner, 404 missing, 413 too large,
  500 server). No unhandled promise rejections.
- No secrets in client-side code. Nothing sensitive in `NEXT_PUBLIC_*`.
- Keep the existing serverless PDF workaround if any parsing stays in Next.js.
- Small, focused commits with clear messages.

---

## 10. Definition of done

- All six phases deployed and working in production.
- Two users can sign in and cannot see each other's documents or history (verify this
  explicitly — it's the security claim the whole design rests on).
- README updated: new architecture diagram, the v2 stack, setup instructions for both
  services, and a short "design decisions" section covering the schema, the namespace
  isolation, and why ingestion is a separate service.
- `.env.example` current in both services.
- New 60-second Loom demo: sign in, upload, watch status, ask a question, view history,
  delete a document.
