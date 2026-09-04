import { strict as assert } from "node:assert";
import { chunkOrder, orderEvent } from "./order_ingest.js";

const event = orderEvent.parse({ orderId: "o1", customerId: "c1", kind: "receipt", text: "Receipt issued", metadata: {} });
assert.deepEqual(chunkOrder(event, 8), ["receipt ", "order o1", ": Receipt", " issued"]);
assert.throws(() => orderEvent.parse({ orderId: "", customerId: "c1", kind: "receipt", text: "x" }));
console.log("order boundary and chunk decision passed");
