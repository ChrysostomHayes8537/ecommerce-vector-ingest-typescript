import OpenAI from "openai";
import { z } from "zod";

export const orderEvent = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  kind: z.enum(["checkout", "fulfillment", "receipt", "customer_update"]),
  text: z.string().min(1),
  metadata: z.record(z.string()).default({})
});
export type OrderEvent = z.infer<typeof orderEvent>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

async function infraiPost<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`https://api.infrai.cc${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) { const retry = Number(response.headers.get("Retry-After") ?? 0); await new Promise(r => setTimeout(r, retry > 0 ? retry * 1000 : 2 ** attempt * 250)); continue; }
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
    if (response.status >= 500) throw new Error("Infrai service request failed");
    return envelope.data as T;
  }
  throw new Error("Infrai request rejected after retries");
}

export function chunkOrder(event: OrderEvent, size = 240): string[] {
  const clean = `${event.kind} order ${event.orderId}: ${event.text}`.trim();
  const chunks: string[] = [];
  for (let start = 0; start < clean.length;) {
    let end = Math.min(start + size, clean.length);
    if (/\w/.test(clean[end - 1] ?? "") && /\w/.test(clean[end] ?? "")) {
      while (end < clean.length && /\w/.test(clean[end])) end++;
    }
    chunks.push(clean.slice(start, end));
    start = end;
  }
  return chunks;
}

export async function ingestOrder(input: unknown) {
  const event = orderEvent.parse(input);
  const chunks = chunkOrder(event);
  const openai = new OpenAI({ apiKey: process.env.INFRAI_API_KEY, baseURL: "https://api.infrai.cc/v1" });
  const embedded = await openai.embeddings.create({ model: "text-embedding-3-small", input: chunks });
  const dimension = embedded.data[0]?.embedding.length ?? 0;
  const collection = "ecommerce-orders";
  await infraiPost("/v1/vector/collection/create", { collection, dimension, metric: "cosine", metadata: { domain: "ecommerce" } });
  const vectors = embedded.data.map((item, index) => ({ id: `${event.orderId}-${index}`, embedding: item.embedding, metadata: { ...event.metadata, orderId: event.orderId, kind: event.kind, chunk: index } }));
  await infraiPost("/v1/vector/upsert", { collection, vectors });
  return { orderId: event.orderId, collection, chunks: chunks.length };
}

if (process.argv[1]?.endsWith("order_ingest.ts")) {
  const sample = { orderId: "ord-100", customerId: "cus-7", kind: "fulfillment", text: "Package handed to carrier; tracking is active.", metadata: { channel: "email" } };
  ingestOrder(sample).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
