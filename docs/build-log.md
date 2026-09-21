# Build log

Every Azure resource, its settings, and the commands used to create or inspect it.
In month 3 this becomes the Terraform checklist.

Verified facts are recorded with the command that produced them so they can be
re-checked later.

---

## Week 1 — Foundations (2026-09-21)

### Subscription and cost control

| Item | Value |
|---|---|
| Subscription | `Azure subscription 1` (ID kept outside the repo — this is a public repository) |
| Budget alert | `docassist-monthly`, **30.00 / month** |

```bash
az consumption budget list -o table
```

> **Open item:** a second, unrelated AIServices resource exists in `westus3`,
> likely left over from a Learn lab. Confirm it holds no deployments and delete it.

### Resource group and Foundry resource

| Item | Value |
|---|---|
| Resource group | `rg-docassist-uaen` |
| Foundry resource | `docassist-uaen-mo` |
| Kind / SKU | `AIServices` / `S0` |
| Region | `uaenorth` |
| Project | `docassist` |
| Custom subdomain | `docassist-uaen-mo` |
| Managed identity | `SystemAssigned` (present, not yet used — Week 5) |
| Public network access | `Enabled` (locked down in Week 7) |

```bash
az cognitiveservices account list \
  --query "[].{name:name, rg:resourceGroup, loc:location, kind:kind, sku:sku.name}" -o table

az cognitiveservices account show -n docassist-uaen-mo -g rg-docassist-uaen \
  --query "{customSubDomain:properties.customSubDomainName, publicAccess:properties.publicNetworkAccess, identity:identity.type}"
```

### Endpoints

Two different endpoints, for two different SDKs (AI-103 exam point):

| Purpose | URL |
|---|---|
| Project endpoint — Foundry SDK (`AIProjectClient`) | `https://docassist-uaen-mo.services.ai.azure.com/api/projects/docassist` |
| Azure OpenAI v1 endpoint — OpenAI SDK | `https://docassist-uaen-mo.openai.azure.com/openai/v1` |

Both are on the project Overview page in ai.azure.com. The deployment Details page
shows the same OpenAI endpoint under the `services.ai.azure.com` hostname with the
operation path appended (`/openai/v1/responses`) — both hostnames route to the same
resource. `base_url` takes the endpoint **without** the operation path.

Stored in `api/.env` as `FOUNDRY_PROJECT_ENDPOINT` and `AZURE_OPENAI_ENDPOINT`.
`api/.env` is gitignored (`.gitignore:34`).

### Model deployments

```bash
az cognitiveservices account deployment list -n docassist-uaen-mo -g rg-docassist-uaen \
  --query "[].{name:name, model:properties.model.name, version:properties.model.version, sku:sku.name, cap:sku.capacity, state:properties.provisioningState, policy:properties.versionUpgradeOption}" -o table
```

| Deployment | Model | Version | Type | Capacity | State |
|---|---|---|---|---|---|
| `gpt-5.4-mini-docassist` | `gpt-5.4-mini` | `2026-03-17` | **GlobalStandard** | 150 | Succeeded |
| `embed` | `text-embedding-3-small` | `1` | **Standard** (regional) | 120 | Succeeded |

Chat deployment limits: **150,000 TPM / 150 RPM**.
Chat model lifecycle: GenerallyAvailable, retirement **2027-09-21**.
Version upgrade policy on both: `OnceNewDefaultVersionAvailable` — versions float.
See `decisions.md` ADR-004.

Deployment-type rationale is in `decisions.md` ADR-002 / ADR-003.

### Embedding dimension

**`text-embedding-3-small` returns 1536-dimension vectors.**

This is the value for the `content_vector` field in Week 2's `create_index.py`.
The v1 (AWS) build used Voyage at 512 dimensions, so **all content must be
re-embedded** — the old vectors are not reusable. As with Pinecone, an Azure AI
Search vector field's dimension is fixed at index creation; a wrong value means
deleting and rebuilding the index.

### Week 1 smoke test

`api/scripts/test_models.py` — calls both deployments with the OpenAI SDK
(`client.responses.create` for chat, `client.embeddings.create` for vectors),
key auth for now. Passed: chat response returned, 1536-dim vector returned.

Token usage on the chat call: 35 in / 127 out / 162 total, `reasoning_tokens=0`.

#### Ungrounded baseline — keep for the Week 3 comparison

Question asked with no retrieval, system prompt
`"You answer questions about business contracts concisely."`:

> **In a UAE employment contract, what is the standard notice period for termination?**

Answer (from model training data only, **not** from any document):

> In the UAE, the **standard notice period for terminating an employment contract
> is typically 30 days**, unless the contract specifies a longer period.
>
> A few quick notes:
> - The notice period must be **at least 30 days and no more than 90 days** under UAE Labour Law.
> - If the contract says something different, that term usually applies as long as it stays within the legal limit.
> - Some cases allow termination **without notice** for serious misconduct.
>
> If you want, I can also explain how notice works for **limited vs. unlimited**
> contracts or for **resignation vs. employer termination**.

Two observations recorded at the time:

1. **The system prompt did not constrain the output.** "Concisely" produced 127
   tokens with headings, a bulleted list, and an unprompted offer to continue.
   Week 3 needs this same `instructions` slot to enforce something much stricter
   (answer only from supplied chunks, cite by ID, say "not found in the documents").
   Expect to need firmer prompting than a single adverb.
2. **The answer is ungrounded and confident.** It has not been checked against
   Federal Decree-Law No. 33 of 2021. Re-ask this exact question in Week 3 against
   indexed contracts and diff the two answers — that contrast is the demo.

> **Open item:** verify the above answer against the actual law. If it is subtly
> wrong, say so explicitly in the README — it is the strongest possible argument
> for grounding.

### Still open at end of Week 1

- [ ] Cross-lingual embedding check (cosine between an EN clause, its Arabic
      translation, the question, and an unrelated clause). Decides whether one
      shared vector space works for both languages, or whether Week 2 ingestion
      needs per-language handling.
- [ ] Verify the ungrounded baseline answer against UAE labour law.
- [ ] Delete the stray `westus3` resource.
