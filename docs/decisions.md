# Decision log

Architecture decisions for the UAE Business Document Assistant, with the reasoning
and the evidence behind each one. Facts verified by CLI are shown with the command.

---

## ADR-001 — Region: UAE North

**Decision.** All project resources go in `uaenorth` (rg `rg-docassist-uaen`).

**Why.** The product premise is a document assistant for UAE businesses handling
contracts and HR policies. Data residency in-country is the differentiator, and it
is the first question an Abu Dhabi client or interviewer will ask.

**Status.** Accepted. Foundry resource `docassist-uaen-mo` (AIServices, S0) created
in `uaenorth`.

---

## ADR-002 — Chat model deployed as GlobalStandard

**Decision.** `gpt-5.4-mini` deployed as **GlobalStandard** (`gpt-5.4-mini-docassist`).

**This was not a default we accepted — it is the only option.** Verified:

```bash
az cognitiveservices model list -l uaenorth \
  --query "[?contains(model.name,'gpt-5.4-mini')].{model:model.name, skus:join(', ', model.skus[].name)}" -o table
```

```
gpt-5.4-mini   2026-03-17   GlobalStandard, GlobalProvisionedManaged
```

Widening the search to *every* model in UAE North that offers a regional `Standard`
deployment type:

```bash
az cognitiveservices model list -l uaenorth \
  --query "[?model.skus[?name=='Standard']].{model:model.name, ver:model.version}" -o tsv | sort -u
```

```
text-embedding-3-large   1
text-embedding-3-small   1
text-embedding-ada-002   2
whisper                  001
```

**No chat or completion model in UAE North offers a regional Standard deployment.**
Embedding models and Whisper do; generative chat models do not.

**What GlobalStandard means here.** Data *at rest* stays in the resource's
geography. Inference *processing* may be handled in any region where Microsoft has
capacity for that model. So the prompt and the retrieved chunks sent at query time
may be processed outside the UAE, even though the resource, the index, and the
stored documents are all in UAE North.

**Options considered.**

| Option | Residency outcome | Verdict |
|---|---|---|
| GlobalStandard (chosen) | Processing may leave the UAE | Only workable option today |
| GlobalProvisionedManaged | Still Global — PTU buys throughput, not residency | Doesn't solve it, and costs reserved capacity |
| A different chat model in UAE North | No chat model there offers regional Standard | Not available |
| A different region | Abandons the UAE-residency premise entirely | Defeats the point |
| Self-hosted / managed compute | In-region, but operationally heavy and off-plan | Out of scope |

**Consequence.** The residency claim for this project must be stated precisely:
*storage and retrieval are in-region; chat inference is not.* Overclaiming
"everything stays in the UAE" would be false. For a client with a hard requirement
that no prompt text leaves the country, this architecture does not qualify today
and the honest answer is that Azure does not currently offer a UAE North chat
deployment that does.

**To verify before quoting this externally:** Microsoft's data residency and Azure
OpenAI data-privacy terms for Global deployment types — confirm the current wording
on processing location vs. storage location, and link it here.

**Status.** Accepted, with the limitation documented. Re-check on each model
refresh; if a regional Standard chat deployment becomes available in UAE North,
revisit immediately.

---

## ADR-003 — Embedding model deployed as Standard (regional)

**Decision.** `text-embedding-3-small` deployed as **Standard** — regional, not Global.

**Why.** Standard *is* available in UAE North for this model (see the table in
ADR-002), so there is no reason to accept Global processing for it. Embedding is
where the bulk of document content is processed: every chunk of every uploaded
contract passes through this deployment at ingest time. Keeping it regional means
the corpus itself is only ever processed in-country.

**Consequence — a deliberate split posture:**

- **Ingest path** (all document text → vectors): processed in UAE North.
- **Query path** (question + top-5 retrieved chunks → answer): may be processed
  outside the UAE, per ADR-002.

This narrows the exposure from "the entire document corpus" to "the chunks
retrieved for a given question." That is a materially better position than
deploying both as Global, and it is worth stating that way rather than treating the
deployment type as a detail.

**Status.** Accepted.

---

## ADR-004 — Model versions float (`OnceNewDefaultVersionAvailable`)

**Decision (current, under review).** Both deployments use the default version
upgrade policy `OnceNewDefaultVersionAvailable`, so the underlying model version
auto-upgrades when Microsoft changes the default.

**Why this matters.** Week 3 produces a retrieval and answer-quality score on a
20-question evaluation set. Week 8 re-runs that evaluation on the private build and
compares. If the chat model version silently changes between those runs, the
comparison measures two different models and the number is not attributable to any
change we made.

**Current versions pinned in this log:** chat `gpt-5.4-mini` @ `2026-03-17`
(retires 2027-09-21), embeddings `text-embedding-3-small` @ `1`.

**Embeddings are the sharper risk.** Re-embedding with a changed model while the
index holds vectors from the old one silently degrades retrieval — the vectors stop
being comparable, and nothing errors.

**Open decision:** either set both deployments to a pinned version before the Week 3
evaluation, or accept the float and record the model version alongside every
evaluation score. Pinning is the safer default.

**Status.** Open — decide before the Week 3 eval run.

---

## ADR-005 — API key auth for now, managed identity in Week 5

**Decision.** Week 1–4 code authenticates with an API key from `api/.env`
(gitignored). Week 5 switches every service to `DefaultAzureCredential`.

**Why.** Getting the pipeline working end to end first keeps the early weeks
debuggable — an auth failure and a wiring failure look the same when both are new.
The resource already has a SystemAssigned managed identity, and the OpenAI SDK call
shape does not change between key auth and token auth, so the migration is a
credential swap rather than a rewrite.

**Consequence.** Until Week 5 there is a live key in the local environment. It is
never committed (`.gitignore:34`). Week 5 is done only when a repo and container
config search finds zero keys.

**Status.** Accepted, with a deadline.
