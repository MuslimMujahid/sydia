# Reranking cost investigation

Investigated on 1 October 2026. **Subsequent owner decision:** use RRF alone, disable the model reranker, and skip further benchmarking. The local runtime and shared Compose defaults now use `HINDSIGHT_API_ENABLE_RERANKING=false` and `HINDSIGHT_API_RERANKER_PROVIDER=rrf`; see the [runbook](./hindsight_operations.md#runtime-and-configuration). The investigation and proposed experiments below describe the prior baseline and are retained as historical evidence, not pending deployment requirements.

The original investigation recommended evaluating Hindsight's native Jev reranker alongside a candidate-cap experiment and an RRF baseline. Jev demonstrated substantially cheaper requests in a small synthetic comparison, but one slow request prevented an immediate deployment recommendation. No application settings, containers, banks, or stored memories were changed during that investigation.

## Current spend and implementation

The attached OpenRouter chart shows Cohere Rerank v3.5 at **$0.333 of $0.71**, approximately **46.9%** of the displayed day's total. At $0.001 per unit this corresponds to 333 search units, not necessarily 333 requests. It does not establish recurring production spend: that day also included development and evaluation activity.

At the investigation boundary, the repository and running container used `cohere/rerank-v3.5` through OpenRouter. The running image ID matched the digest pinned in `docker/hindsight.environment.yml`: Hindsight `0.10.2-slim`, `sha256:3c7b54a7e7dc92c3ad6a6b874aa9b3e96603b2c6fc4b215d9890a93578d2de99`.

Code and runtime findings:

- `apps/backend/src/infra/hindsight/http-hindsight.gateway.ts` sends `budget=low`, normally includes world facts and observations, and controls the **returned** context with `max_tokens`. Lowering the default 800 returned tokens does not directly lower the candidate set or the Cohere search-unit charge. Source-fact tokens are another output allowance, not a separate model reranking request.
- The running Hindsight config defaults to **300 candidates**, with optional overrides for low/mid/high recall budgets. The app does not expose these variables through Compose yet. A low recall budget does not itself establish a 100-candidate reranker cap.
- `TurnDecisionService` already uses Jev to gate automatic recall. Local `BACKEND_MEMORY_RECALL_DECISION_MODE=enabled` and inclusion threshold `0.6` are already configured. Enabling the gate again offers no new optimization. Explicit memory searches still need their own treatment.
- The running Hindsight `engine/consolidation/consolidator.py` explicitly uses `reranking="interleave"` for observation consolidation. That path skips the model reranker. Do not attribute this bill to background consolidation without further evidence.
- Native `typesafe`, `zeroentropy`, `rrf`, `tei`, and local reranker implementations are present in the pinned image. Native Jev ranks candidates together with a typed Choice request; it does not require one request per memory. It splits large pools by option/context limits and runs a final ranking round. Runtime limits are 250 options and a defensive 26,000-token question budget.
- Hindsight's native Jev adapter converts ranking into ordinal scores; these are not absolute relevance confidence. Its optional pruning makes another request and changes returned context. Keep pruning disabled for the first comparison.

Langfuse metadata was queried read-only using the CLI for 1 October in Asia/Makassar, selecting no input/output fields. The 246 observations contained assistant/policy/decision activity, but no Cohere reranking observation. Existing Hindsight tracing is disabled and its HTTP rerank client discards response usage. Therefore Langfuse does not currently reconcile the screenshot's reranking cost with queries/candidate counts. The current Hindsight metrics cover only nine recall stages since the process started and cannot explain the full day's bill.

## Small live comparison

Results and complete synthetic fixtures: [reranking-smoke-20261001.json](./evaluations/reranking-smoke-20261001.json).

Eight English, Indonesian, mixed-language, and cross-language queries ranked the same 20 synthetic personal memories. Candidate order was shuffled with a fixed seed per query; model call order alternated. Jev used the running Hindsight adapter's rank-request template through OpenRouter, with pruning off. Expected answers were authored with the fixtures. Both endpoints received only synthetic data.

| Measurement                 | Cohere v3.5 |     Jev 1.13 |
| --------------------------- | ----------: | -----------: |
| Successful requests         |         8/8 |          8/8 |
| Total reported `usage.cost` |      $0.008 | $0.000368256 |
| Mean cost per ranking       |      $0.001 | $0.000046032 |
| Intended memory at rank 1   |         5/8 |          8/8 |
| Intended memory in top 3    |         8/8 |          8/8 |
| Median request wall time    |  1,009.5 ms |       705 ms |
| Longest request             |    2,616 ms |    15,640 ms |

Jev cost **95.4% less** in this sample. Every successful response supplied cost; none of these costs was estimated. Its resolved model was `typesafe/jev-1.13-20260917`. Additional probes confirmed that OpenRouter accepts that exact snapshot and a single-candidate Choice request.

Two Cohere billing probes held query/document lengths short and varied only candidate count:

| Submitted documents | Returned `top_n` | Search units | Reported cost |
| ------------------- | ---------------: | -----------: | ------------: |
| 100                 |                1 |            1 |        $0.001 |
| 101                 |                1 |            2 |        $0.002 |

This confirms that returning fewer results does not lower billing and that crossing a candidate boundary can increase it. Cohere's pricing page defines a unit as a query with up to 100 documents, with long query/document pairs contributing additional chunks. Measure returned `usage.search_units` rather than assuming a 100-candidate cap always means one unit.

**Limits:** this is an endpoint smoke comparison, not an end-to-end Hindsight test, a held-out retrieval benchmark, or a p95 estimate. It bypasses Hindsight's actual retrieval, admission filtering, scoring boosts, source-fact dependencies, and context truncation. Connections were not reused, so wall time includes connection setup. All eight queries had an intended answer; no-answer behavior, large pools, multiple relevant facts, injection resistance, and sustained concurrency remain unmeasured. One Jev request exceeded the locally configured **5,000 ms** recall timeout; cheap requests that arrive too late do not establish usable savings.

The entire investigation's endpoint requests, including billing and contract probes, reported about **$0.0114** in charges.

## Alternatives and economics

Prices checked against provider pages on the investigation date:

| Option                                 | Advertised billing                 | Practical fit                                                                                                               |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Current Cohere via OpenRouter          | $0.001/search unit                 | Baseline; small requests still pay the minimum unit                                                                         |
| Jev via OpenRouter or TypeSafe         | $0.042/M input tokens, output free | Native Hindsight support; existing OpenRouter credential; validate tail latency and Indonesian recall                       |
| ZeroEntropy `zerank-2`                 | $0.025/M tokens                    | Native Hindsight support; worth comparing as a dedicated multilingual reranker; requires its own credential                 |
| Qwen3-Reranker-8B on DeepInfra         | $0.050/M tokens                    | Hosted multilingual alternative; Hindsight's LiteLLM SDK adapter supports it                                                |
| Hindsight RRF without a model reranker | $0 reranker API charge             | Keep fused retrieval and subsequent processing; embeddings/database work still cost money; compare quality                  |
| Self-hosted multilingual reranker      | No per-request API fee             | CPU/GPU, memory, operations, and latency costs remain; existing hardware is more plausible than buying a GPU for this spend |

Provider token accounting differs. A cross-encoder may repeat the query for each document; Jev's listwise payload has different overhead and may need several rounds. Compare reported cost for the same candidate pool, not just advertised per-token prices. TypeSafe documents English as its strongest language; the synthetic Indonesian results do not establish general language parity.

For Jev, one $0.001 Cohere unit buys approximately **23,810 billed input tokens**. Example costs against a single Cohere unit:

| Jev billed tokens across all ranking calls |      Cost | Reduction versus $0.001 |
| -----------------------------------------: | --------: | ----------------------: |
|                                      1,000 | $0.000042 |                   95.8% |
|                                      5,000 | $0.000210 |                   79.0% |
|                                     10,000 | $0.000420 |                   58.0% |
|                                     24,000 | $0.001008 |           0.8% increase |

Larger Cohere requests can cost several units, so use their actual charge as the denominator. Fallback and retry costs must also be included. Applying the smoke test's 95.4% reduction to the screenshot alone would reduce its reranking line to approximately $0.0153 and its total to $0.3923, a 44.7% total reduction. This is an illustration with other costs held constant, not a traffic forecast.

## Recommended next experiment

1. **Meter before selecting a winner.** Record model/snapshot, candidate count and length distribution, search units/input tokens, `usage.cost`, latency, timeouts, retries, and fallback provider. Use metadata-only instrumentation or a rerank usage relay; keep raw query/memory logging disabled. Distinguish ordinary user turns, explicit memory search, and evaluation activity.
2. **Compare Cohere at 300 versus 100 candidates for low-budget recall.** The relevant runtime variable is `HINDSIGHT_API_RERANKER_MAX_CANDIDATES_LOW=100`; add Compose forwarding before using it. If requests currently cross the 100/200 boundaries, this can remove billed units. If they already contain fewer than 100 short documents, it may save nothing. Test 50 only after checking coverage at 100.
3. **Compare native Jev with pruning off**, using the pinned snapshot and the same candidate sets, plus an RRF baseline. Include multiple valid memories, corrections, negation, wrong subjects, temporal queries, long pools, and no relevant memory. Evaluate final admitted context and answer usefulness, not only top-1 endpoint results. Compare ZeroEntropy if a credential is available.
4. **Bound latency and fallback.** The native provider defaults to a 60-second timeout and shared retry behavior; these do not fit the app's five-second recall deadline. Explicitly configure provider timeout/retries and measure the whole path. A possible experiment is Jev with a short deadline and Cohere fallback, or RRF fallback for latency; validate it rather than assuming fallback completes within the remaining budget. Fallback prevents provider errors from becoming missing recall but cannot fix a semantically wrong successful ranking.
5. **Remove repeated work.** Reuse identical recall work within a turn when automatic recall and an explicit search ask the same question with the same filters. Any longer-lived cache must include owner/bank, query, time-sensitive filters, and memory/suppression version; rerun admission validation and invalidate on retain, correction, forget, and erasure. Do not cache across users.

Existing `0.6` recall gating can be evaluated for missed useful recall and avoidable calls, but increasing its threshold solely to reduce cost risks losing useful personalization.

An isolated native Jev experiment needs these **container** values (configuration sketch only; not applied):

```dotenv
HINDSIGHT_API_RERANKER_PROVIDER=typesafe
HINDSIGHT_API_RERANKER_TYPESAFE_BASE_URL=https://openrouter.ai/api
HINDSIGHT_API_RERANKER_TYPESAFE_MODEL=typesafe/jev-1.13-20260917
HINDSIGHT_API_RERANKER_TYPESAFE_API_KEY=<existing OpenRouter credential>
HINDSIGHT_API_RERANKER_TYPESAFE_PRUNE_CANDIDATES=false
```

The adapter appends `/v1/systemone`, explaining the base URL above. The repository's Compose environment currently forwards only OpenRouter rerank variables; adding these values to root `.env` alone will not configure the native TypeSafe adapter. Timeout, retry, capacity, and fallback variables must also be forwarded and evaluated. The native Hindsight adapter does not inherit the Nest application's decision concurrency controls.

Use the existing optimization target of at least 20% affected-stage cost reduction without material recall loss or more than 5% full-mix interactive p95 regression as an initial gate. The eight-query smoke test does not satisfy a release gate.

## Sources

- [OpenRouter Cohere pricing](https://openrouter.ai/cohere/rerank-v3.5) and [rerank response usage](https://openrouter.ai/docs/api/api-reference/rerank/create-rerank).
- [Cohere search-unit definition](https://cohere.com/pricing).
- [OpenRouter Jev pricing](https://openrouter.ai/typesafe/jev-1.13) and [TypeSafe model limits, language support, and versioning](https://docs.typesafe.ai/models).
- [Hindsight configuration reference](https://hindsight.vectorize.io/developer/configuration). Compatibility and detailed behavior were checked against the actual pinned container source, not inferred from this evolving page.
- [ZeroEntropy pricing](https://www.zeroentropy.dev/pricing).
- [DeepInfra Qwen3-Reranker-8B pricing](https://deepinfra.com/Qwen/Qwen3-Reranker-8B).
- [Langfuse cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking).
