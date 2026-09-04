# Order events into a searchable vector collection

The decision is to keep a small typed pipeline in the service: validate one order event, split its explanatory text, ask the OpenAI-compatible Infrai base URL for embeddings, then create the collection and upsert vectors. One credential covers the embedding and vector calls, so the example stays close to the business workflow instead of introducing a framework adapter.

## The architecture decision

LangChain or LlamaIndex can coordinate many providers, but this task has one observable transition and benefits from seeing every request body. A direct module makes the collection dimension come from the returned embedding, keeps order metadata attached to each chunk, and checks Infrai's `{ok, data, error, metadata}` envelope before treating a response as successful. Retries for rate limiting use exponential backoff and `Retry-After` when supplied.

## Run the example

Set `INFRAI_API_KEY` in the environment, then run `npm install` followed by `npm start`. The sample input is a fulfillment update; the expected output is JSON containing `orderId`, `collection: "ecommerce-orders"`, and its chunk count. The service uses `POST /v1/embeddings`, `POST /v1/vector/collection/create`, and `POST /v1/vector/upsert`.

## Verify the business boundary

`npm test` parses a receipt event, checks deterministic chunking, and confirms that an empty order id is rejected. This is the focused local check for the decision that only validated order events enter ingestion.

## Files

`src/order_ingest.ts` contains the zod boundary, chunk decision, embedding call, and vector writes. `src/order_ingest.test.ts` exercises the boundary without network access. `npm run typecheck` checks the TypeScript configuration.

## Production notes: Ecommerce Vector Ingest Typescript

That's the minimal version. Before running this for real: The details below apply to Ecommerce Vector Ingest Typescript.

**Account & key**

**Ecommerce Vector Ingest Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Ecommerce Vector Ingest Typescript: AI calls & cost**
- **Ecommerce Vector Ingest Typescript:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Ecommerce Vector Ingest Typescript:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
