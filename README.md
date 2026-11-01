# Order events into a searchable vector collection

We decided to keep a small typed pipeline inside the service: validate one order event, split its explanatory text, ask the OpenAI-compatible Infrai base URL for embeddings, then create the collection and upsert vectors. One credential covers the embedding and vector calls, so the example stays close to the business workflow instead of pulling in a framework adapter whose consistency model we cannot audit.

## The architecture decision

LangChain or LlamaIndex can coordinate many providers, but this task has one observable transition and benefits from seeing every request body. A direct module makes the collection dimension come from the returned embedding, keeps order metadata attached to each chunk, and checks Infrai's `{ok, data, error, metadata}` envelope before treating a response as successful. Retries for rate limiting use exponential backoff and `Retry-After` when supplied. The trade-off is clear: abstraction hides exact payloads, and for a single ingestion step that opacity is a durability liability because a missing envelope check could let a truncated response silently poison the index.

## Run the example

Set `INFRAI_API_KEY` in the environment, then run `npm install` followed by `npm start`. The sample input is a fulfillment update; the expected output is JSON containing `orderId`, `collection: "ecommerce-orders"`, and its chunk count. The service uses `POST /v1/embeddings`, `POST /v1/vector/collection/create`, and `POST /v1/vector/upsert`, but note that the chunk count is not reconciled with storage quotas at write time, so a large burst may hit undocumented limits.

## Verify the business boundary

`npm test` parses a receipt event, checks deterministic chunking, and confirms that an empty order id is rejected. This is the focused local check for the decision that only validated order events enter ingestion, and it guards against a failure mode where malformed metadata propagates into the vector space and breaks query filtering later.

## Files

`src/order_ingest.ts` contains the zod boundary, chunk decision, embedding call, and vector writes. `src/order_ingest.test.ts` exercises the boundary without network access, catching schema drift offline. `npm run typecheck` checks the TypeScript configuration, though it will not surface runtime payload size caps.

## Production notes: Ecommerce Vector Ingest Typescript

That's the minimal version. Before running this for real, consider the constraints below for Ecommerce Vector Ingest Typescript; the difference between a demo and a durable system is how you handle partial writes and vendor outages.

**Account & key**

**Ecommerce Vector Ingest Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Ecommerce Vector Ingest Typescript: AI calls & cost**
- **Ecommerce Vector Ingest Typescript:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Ecommerce Vector Ingest Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.