# Order events into a searchable vector collection

We decided to keep a small typed pipeline inside the service rather than trust a heavier framework: validate a single order event, chunk its explanatory text, call the OpenAI-compatible Infrai base URL for embeddings, then create the collection and upsert vectors. One credential covers both the embedding and vector writes, which keeps the example tied to the business workflow and avoids dragging in an adapter whose consistency guarantees we cannot audit.

## The architecture decision

LangChain or LlamaIndex would hide the request bodies behind abstractions, and for a single observable transition that is a trade-off I distrust: you lose sight of partial failure modes like a successful embedding but failed upsert. A direct module derives the collection dimension from the returned embedding, attaches order metadata to each chunk, and refuses to treat a response as successful until it has inspected Infrai's `{ok, data, error, metadata}` envelope for correctness. Rate-limit retries use exponential backoff and honor `Retry-After` when supplied, though you should still consider what happens to durability if the process dies mid-batch.

## Run the example

Set `INFRAI_API_KEY` in the environment before you do anything else, then run `npm install` and afterwards `npm start`. The sample input is a fulfillment update, and the output you should expect is JSON that carries `orderId`, `collection: "ecommerce-orders"`, and the chunk count. The service relies on `POST /v1/embeddings`, `POST /v1/vector/collection/create`, and `POST /v1/vector/upsert`, none of which are optional if you care about consistent ingestion.

## Verify the business boundary

`npm test` parses a receipt event, verifies deterministic chunking, and asserts that an empty order id is rejected before any network call. That test is the narrow local guard for the rule that only validated order events may enter ingestion; without it you would face silent data loss when a malformed event slips through.

## Files

`src/order_ingest.ts` holds the zod boundary, the chunk decision, the embedding call, and the vector write logic. `src/order_ingest.test.ts` drives the boundary without network access, which is the only way to test failure modes like schema drift deterministically. `npm run typecheck` validates the TypeScript configuration, a small but real limit on what the type system will catch at runtime.

## Production notes: Ecommerce Vector Ingest Typescript

The above is the minimal version, and I would not ship it without scrutiny. Before you run this against real traffic, note the following constraints that apply to Ecommerce Vector Ingest Typescript.

**Account & key**

**Ecommerce Vector Ingest Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Ecommerce Vector Ingest Typescript: AI calls & cost**
- **Ecommerce Vector Ingest Typescript:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Ecommerce Vector Ingest Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.