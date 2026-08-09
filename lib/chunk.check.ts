import { chunkText } from "./chunk";

const text = `Retrieval-augmented generation combines a search step with a generation step. Instead of relying purely on what a language model memorized during training, the system first looks up relevant passages from an external knowledge source, then feeds those passages to the model alongside the user's question. This grounds the model's answer in real, verifiable text rather than the model's own possibly outdated or hallucinated recollection.

The retrieval step depends on embeddings. An embedding model converts a chunk of text into a vector of numbers, positioned in a high-dimensional space such that semantically similar pieces of text end up near each other. When a user asks a question, that question is embedded using the same model, and the system searches for the stored chunks whose vectors are closest to the question's vector. Closeness is typically measured with cosine similarity, which captures the angle between two vectors rather than their raw magnitude.

Chunking matters because embedding models and language models both have limits on how much text they can process at once, and because retrieval precision improves when chunks are small enough to be topically focused. A chunk that is too large might contain the right answer buried among irrelevant sentences, diluting its embedding and making it harder to retrieve. A chunk that is too small might lose the surrounding context needed to make sense of a sentence on its own. Overlap between consecutive chunks helps guard against ideas or sentences being awkwardly split exactly at a chunk boundary, so that a concept mentioned near the edge of one chunk still appears fully within a neighboring chunk.`;

const longResult = chunkText(text);
console.log("long:", longResult.length, "chunks");
console.log(longResult.map(c => c.length));

const shortResult = chunkText(text.slice(0, 100));
console.log("short:", shortResult.length, "chunks");

const boundaryResult = chunkText(text.slice(0, 1500));
console.log("boundary:", boundaryResult.length, "chunks");

// overlap sanity check between chunk 0 and chunk 1 of the long case
console.log("overlap matches:", longResult[0].slice(-200) === longResult[1].slice(0, 200));
