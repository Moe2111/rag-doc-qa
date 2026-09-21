# UAE Business Document Assistant: 8-Week Azure Build Plan

**Goal:** Rebuild rag-doc-qa as a secured, UAE-residency-aware document assistant on Azure while you study for AI-103.

**Daily rhythm:** about 3 hours of AI-103 study and 3 hours of building, 6 days a week, with 1 day off. Each week pairs the study topic with the build task that uses it.

**End state after week 8:** a working app where users upload Arabic or English business documents and get answers with clause-level citations. The backend services sit behind private endpoints in UAE North. Terraform and CI/CD come in month 3.

---

## Key design decisions

**Backend in Python.** Keep your Next.js frontend and rewrite the ingest/query backend in Python with FastAPI. AI-103 expects Python experience and includes Python SDK questions, so every line of backend code doubles as exam practice. Consulting firms also hire heavily for Python.

**Two containers.** A public `frontend` (Next.js) and an internal-only `api` (FastAPI). Only the frontend can reach the API. That split becomes one of your security talking points.

**No API keys by the end.** The app authenticates to every Azure service with managed identity.

**Region: UAE North** for everything, with any model-availability exceptions written down and justified.

### Target architecture

```
User ──► Container Apps: frontend (Next.js, public ingress)
              │
              ▼
         Container Apps: api (FastAPI, internal ingress)
              │  managed identity, all traffic inside the VNet
              ├──► Microsoft Foundry / Azure OpenAI  (private endpoint)
              ├──► Azure AI Search                  (private endpoint)
              ├──► Blob Storage                      (private endpoint)
              └──► Key Vault                         (private endpoint)

Monitoring: Application Insights + Log Analytics
Images: Azure Container Registry (pulled with managed identity)
```

### Repo layout

```
/frontend   Next.js UI (from rag-doc-qa)
/api        FastAPI backend (new, Python)
/eval       test questions and scoring script
/docs       architecture diagram, decision log, build log
/infra      empty until month 3 (Terraform)
```

Before you touch anything, run `git tag v1-aws` on the current version. The "rebuilt from AWS to Azure" story needs the old version preserved.

**Keep a build log from day one** (`docs/build-log.md`). Record every resource you create, its settings, and every CLI command you run. In month 3 this log becomes your Terraform checklist and saves you days.

---

## Week 1: Foundations

**AI-103 study:** Plan and manage an Azure AI solution, part 1. Cover Foundry resources and projects, model deployment types, regions and quotas, and cost management.

**Build:**
- [ ] Create a resource group in UAE North (e.g. `rg-docassist-uaen`).
- [ ] Set a monthly **budget alert** on the subscription with a limit you're comfortable with. Do this before creating anything that costs money.
- [ ] Create a Microsoft Foundry resource and project in UAE North.
- [ ] Check which chat and embedding models you can deploy in UAE North, and under which deployment types. Deploy one chat model and `text-embedding-3-small` (or the closest available embedding model).
- [ ] If a model is only available as a Global deployment, read Microsoft's data residency terms for that deployment type. Write down what you chose and why in `docs/decisions.md`. Interviewers in Abu Dhabi will ask about this.
- [ ] Scaffold the repo: move the Next.js app into `/frontend` and create `/api` with FastAPI.
- [ ] Write a Python script that calls the chat model and the embedding model. Use keys for now; you remove them in week 5.

**Done when:** a Python script gets a chat response and an embedding vector from your UAE North deployments.

---

## Week 2: Ingestion pipeline

**AI-103 study:** Generative AI solutions, part 1. Cover RAG, grounding, Azure AI Search indexes, vector and hybrid search.

**Build:**
- [ ] Create a Storage account with a `documents` container.
- [ ] Create an Azure AI Search service on the **Free** tier for now.
- [ ] Write an index-creation script in Python (`api/scripts/create_index.py`). Fields: `id`, `doc_id`, `doc_name`, `page`, `clause_ref`, `language`, `content`, `content_vector`. Note that your old Voyage vectors were 512 dimensions, so set the new vector field to match your Azure embedding model and re-embed everything.
- [ ] Build `POST /ingest` in FastAPI:
  1. Upload the file to Blob Storage.
  2. Extract text from digital PDFs (e.g. `pypdf`), keeping page numbers.
  3. Chunk by clause. Split on numbered headings like `1.`, `2.3`, `Article 5` where they exist, and fall back to ~500-token windows with overlap.
  4. Detect the language of each chunk.
  5. Embed each chunk and upload to the index.
- [ ] Collect 5–10 test documents: sample employment contracts, a company policy, an NDA. Include at least two in Arabic. Use public templates or write your own, never real confidential documents.

**Done when:** you upload a PDF and see its chunks, with page and clause metadata, in the Search index.

**Why the script matters:** you can't upgrade a Free-tier Search service in place. In week 6 you'll create a new Basic-tier service, and the script rebuilds your index in one command.

---

## Week 3: Query, citations, and evaluation

**AI-103 study:** Generative AI solutions, part 2. Cover prompt engineering, content safety and filters, responsible AI, and evaluating generative apps.

**Build:**
- [ ] Build `POST /query`: embed the question, run hybrid search (keyword + vector), take the top 5 chunks, and send them to the chat model.
- [ ] Write the system prompt so the model answers only from the provided chunks, cites them by ID, and says "not found in the documents" when the chunks don't cover the question.
- [ ] Return a structured response: `answer` plus a `sources` list with doc name, page, and clause reference.
- [ ] Set the Arabic analyzer (`ar.microsoft`) on Arabic content so keyword search works for Arabic questions. The simplest approach is two text fields, one per language, filled based on detected language.
- [ ] Review the content filter settings on your model deployment and note them in `docs/decisions.md`.
- [ ] Build a small evaluation set in `/eval`: 20 questions, each with the document and clause that should answer it. Write a script that reports how often the correct clause appears in the top 5 results.

**Done when:** you get cited answers in both languages and have a retrieval score you can quote (e.g. "correct clause in top 5 for 17/20 questions").

---

## Week 4: Ship stage 1 (public)

**AI-103 study:** Plan and manage, part 2. Cover monitoring, logging, tracing, and deploying AI apps.

**Build:**
- [ ] Update the Next.js frontend to call the new API: upload page, question box, answer with clickable source list.
- [ ] Write Dockerfiles for both apps (use `output: 'standalone'` for Next.js).
- [ ] Create an Azure Container Registry (Basic tier) and push both images.
- [ ] Create a Container Apps environment and deploy both apps. Temporarily give the `api` external ingress for testing.
- [ ] Connect Application Insights and confirm you can see requests and errors.
- [ ] Take screenshots and record a rough 1-minute demo of the working public version.

**Stage 1 gate:** the app works end to end from a public URL. Commit and tag `v2-azure-public`.

---

## Week 5: Identity and secrets

**AI-103 study:** Plan and manage, security topics. Cover managed identities, RBAC for AI services, key-based vs keyless auth, and Key Vault.

**Build:**
- [ ] Enable a system-assigned managed identity on the `api` container app.
- [ ] Assign roles to that identity:
  - `Cognitive Services OpenAI User` on the Foundry/OpenAI resource
  - `Search Index Data Contributor` on the Search service
  - `Storage Blob Data Contributor` on the storage account
- [ ] Enable role-based access on the Search service, since it defaults to key-based access.
- [ ] Switch the Python code to `DefaultAzureCredential` from `azure-identity` for all three services. Delete every key from your code and environment variables.
- [ ] Give both container apps permission to pull from ACR with managed identity (`AcrPull`) and disable the ACR admin user.
- [ ] Create a Key Vault for any remaining config, and reference it from Container Apps.
- [ ] Switch the `api` to **internal ingress** so only the frontend can call it.

**Done when:** a search of your repo and container settings finds zero keys, and the app still works.

---

## Week 6: Private networking, part 1

**AI-103 study:** Information extraction and text analysis. Cover Document Intelligence, Content Understanding, and language detection. You'll build with these in months 4–5; for now, try them in the Foundry portal with one of your Arabic test PDFs.

**Build:**
- [ ] Draw your network on paper first: one VNet, one subnet for the Container Apps environment, one subnet for private endpoints.
- [ ] Create the VNet in UAE North. Delegate the Container Apps subnet to `Microsoft.App/environments` and check Microsoft's minimum subnet size for your environment type.
- [ ] Create a **new** Container Apps environment inside the VNet. You can't move an existing environment into a VNet after creation, so you redeploy both apps into the new one.
- [ ] Create a new Search service on the **Basic** tier (Free tier doesn't support private endpoints) and rerun your index script and ingestion.

**Cost warning:** Basic-tier Search bills continuously. From this week on, check your spend every few days.

**Done when:** both apps run in the VNet-integrated environment against the new Search service, still over public service endpoints.

---

## Week 7: Private networking, part 2

**AI-103 study:** Agents and computer vision. Cover Foundry Agent Service, tools and function calling, multi-agent patterns, and image analysis.

**Build:**
- [ ] Create private endpoints in the endpoints subnet for: Foundry/OpenAI, AI Search, Blob Storage, Key Vault.
- [ ] Create and link the private DNS zones:
  - `privatelink.openai.azure.com` (check the Foundry docs for any additional zones your resource type needs)
  - `privatelink.search.windows.net`
  - `privatelink.blob.core.windows.net`
  - `privatelink.vaultcore.azure.net`
- [ ] From the `api` container's console, run `nslookup` on each service hostname and confirm each one resolves to a private IP (10.x.x.x). Most failures at this stage are DNS problems, so budget a day for troubleshooting.
- [ ] Disable public network access on all four services.
- [ ] Confirm from your laptop that you can't reach the services directly, and that the app still works.
- [ ] Note in `docs/decisions.md` that ACR stays public (private endpoints need the Premium tier), with admin access disabled and pulls restricted to managed identity. Explaining a tradeoff like this shows judgment.

**Stage 2 gate:** the data plane is fully private and the app works end to end. Tag `v3-azure-private`.

---

## Week 8: Package it and prepare for the exam

**AI-103 study:** Practice exams under timed conditions, then targeted review of your weakest domain. Book the exam for the end of this week or early week 9.

**Build:**
- [ ] Draw a clean architecture diagram (draw.io or Excalidraw) and add it to `/docs`.
- [ ] Write the README: problem, architecture, security design, residency decisions, evaluation score, and how to run it locally.
- [ ] Rerun the evaluation set on the private version and record the score.
- [ ] Record a 3-minute demo: upload an Arabic contract, ask a question, show the cited clause, then show the private endpoints and the blocked public access in the portal.
- [ ] Optional: add Entra ID sign-in to the frontend with Container Apps built-in authentication. Enterprises expect it.
- [ ] Control cost: once the demo is recorded, delete the Basic-tier Search service. Your index script and build log let you recreate it in month 3.

**Done when:** a recruiter can understand the project from the README and demo in under five minutes.

---

## After week 8

- **Month 3:** Rebuild everything with Terraform using your build log, add a GitHub Actions pipeline, then run `terraform destroy` after a final demo.
- **Months 4–5:** Add Document Intelligence or Content Understanding for scanned Arabic PDFs and field extraction (parties, dates, termination terms).
- **If time allows:** An agent step that compares a contract against a standard policy and lists the differences for a human reviewer.

## Resume line to aim for

> Built a bilingual (Arabic/English) document Q&A system on Azure in UAE North with clause-level citations, keyless managed-identity auth, and private endpoints for all data services; measured retrieval accuracy on a 20-question evaluation set.
