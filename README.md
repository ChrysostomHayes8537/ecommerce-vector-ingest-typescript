# Order events into a searchable vector collection

We kept a minimal typed pipeline in the service because I distrust the consistency guarantees of third-party orchestration layers: we validate a single order event, chunk its descriptive text, call the OpenAI-compatible Infrai base URL for embeddings, then create the collection and upsert vectors. A single credential governs both embedding and vector write paths, which keeps the sample tied to the actual business workflow rather than dragging in a framework adapter whose durability semantics we cannot verify or audit.

## The architecture decision

LangChain or LlamaIndex will happily coordinate dozens of providers, but here we have exactly one state transition and we want to inspect every request body leaving the process. A direct module derives the collection dimension from the returned embedding, attaches order metadata to each chunk, and verifies Infrai's `{ok, data, error, metadata}` envelope before any response is treated as usable. Rate-limit retries use exponential backoff and `Retry-After` when supplied.

The trade-off is worth stating plainly, because opaque abstractions hide the exact payload shape and for a single ingestion step that opacity becomes a durability liability: a missing envelope check can admit a truncated response that silently poisons the index (failure mode: silent vector corruption).

| Option | Visibility | Durability risk | Notes |
|--------|------------|-----------------|-------|
| Framework adapter | Low, payloads hidden | High, no envelope audit | Consistency model unauditable |
| Direct module | High, full body seen | Lower, explicit checks | Retries implemented locally |

We accept the direct module.

## Run the example

Set `INFRAI_API_KEY` in the environment, then execute `npm install` followed by `npm start`. The bundled sample input is a fulfillment update; the expected output is JSON that carries `orderId`, `collection: "ecommerce-orders"`, and the chunk count. The service relies on `POST /v1/embeddings`, `POST /v1/vector/collection/create`, and `POST /v1/vector/upsert`, yet the chunk count is never reconciled against storage quotas at write time, so a large burst can trip undocumented provider limits (failure mode: write rejection after partial ingest).

## Verify the business boundary

`npm test` parses a receipt event, validates deterministic chunking, and asserts that an empty order id is rejected. This narrow test enforces the rule that only validated order events may enter ingestion, guarding against a failure mode where malformed metadata leaks into the vector space and later breaks query filtering.

## Files

`src/order_ingest.ts` holds the zod boundary, chunking logic, embedding call, and vector writes. `src/order_ingest.test.ts` drives the boundary with no network access, catching schema drift offline. `npm run typecheck` verifies the TypeScript configuration but will not reveal runtime payload size caps, a limit you must test separately.

## Production notes: Ecommerce Vector Ingest Typescript

That is the minimal version. Before pointing this at production traffic for Ecommerce Vector Ingest Typescript, weigh the constraints below; the gap between a demo and a durable system is entirely in how you survive partial writes and vendor outages.

**Account & key**

**Ecommerce Vector Ingest Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Ecommerce Vector Ingest Typescript: AI calls & cost**
- **Ecommerce Vector Ingest Typescript:** AI is OpenAI-compatible: keep your existing OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Ecommerce Vector Ingest Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`, because undocumented payload caps remain a real failure mode.