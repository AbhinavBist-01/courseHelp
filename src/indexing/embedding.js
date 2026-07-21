import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNKS_FOLDER = path.join(__dirname, "..", "chunks");

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;

const EMBEDDING_BATCH_SIZE = 100;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const pineconeIndexName = process.env.PINECONE_INDEX;

if (!pineconeIndexName) {
  throw new Error("PINECONE_INDEX is not set.");
}

const index = pinecone.index(pineconeIndexName);

function getChunkFiles(folder) {
  let files = [];

  const entries = fs.readdirSync(folder, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      files.push(...getChunkFiles(fullPath));
    } else if (
      entry.name.endsWith(".json") &&
      !entry.name.includes("captions")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

async function embedBatch(chunks) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    input: chunks.map((c) => c.text),
  });

  return response.data;
}

async function processFile(file) {
  const chunks = JSON.parse(fs.readFileSync(file, "utf8"));

  console.log(`\n📄 ${path.basename(file)} (${chunks.length} chunks)`);

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);

    console.log(`Embedding batch ${i + 1} - ${i + batch.length}`);

    const embeddings = await embedBatch(batch);

    const vectors = batch.map((chunk, indexInBatch) => ({
      id: chunk.id,

      values: embeddings[indexInBatch].embedding,

      metadata: {
        ...chunk.metadata,

        text: chunk.text,
      },
    }));

    await index.upsert({ records: vectors });

    console.log(`Uploaded ${vectors.length} vectors`);
  }
}

async function main() {
  const files = getChunkFiles(CHUNKS_FOLDER);

  console.log(`Found ${files.length} chunk files\n`);

  for (const file of files) {
    await processFile(file);
  }

  console.log("\n🎉 Finished indexing!");
}

main().catch(console.error);
