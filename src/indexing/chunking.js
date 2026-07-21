import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { encodingForModel } from "js-tiktoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFolder = path.join(__dirname, "parsed");
const outputFolder = path.join(__dirname, "chunks");

const encoder = encodingForModel("text-embedding-3-small");

const MAX_TOKENS = 800;
const OVERLAP_TOKENS = 100;

function countTokens(text) {
  return encoder.encode(text).length;
}

function walk(folder) {
  const entries = fs.readdirSync(folder, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.name.endsWith(".json")) continue;
    if (entry.name === "captions.json") continue;

    chunkLesson(fullPath);
  }
}

function chunkLesson(filePath) {
  const captions = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!captions.length) return;

  const chunks = [];

  let current = [];
  let currentTokens = 0;
  let chunkNumber = 1;

  for (const caption of captions) {
    const tokens = countTokens(caption.text);

    if (current.length > 0 && currentTokens + tokens > MAX_TOKENS) {
      chunks.push(buildChunk(current, chunkNumber++));

      // ---------- overlap ----------
      let overlap = [];
      let overlapTokens = 0;

      for (let i = current.length - 1; i >= 0; i--) {
        const t = countTokens(current[i].text);

        if (overlapTokens + t > OVERLAP_TOKENS) break;

        overlap.unshift(current[i]);
        overlapTokens += t;
      }

      current = [...overlap];
      currentTokens = overlapTokens;
    }

    current.push(caption);
    currentTokens += tokens;
  }

  if (current.length) {
    chunks.push(buildChunk(current, chunkNumber));
  }

  const relative = path.relative(inputFolder, filePath);

  const outputPath = path.join(outputFolder, relative);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify(chunks, null, 2));

  console.log(`✔ ${path.basename(filePath)} → ${chunks.length} chunks`);
}

function buildChunk(captions, chunkNumber) {
  const first = captions[0];
  const last = captions[captions.length - 1];

  const text = captions.map((c) => c.text).join(" ");

  return {
    id: `${first.metadata.lessonFile}_chunk_${String(chunkNumber).padStart(4, "0")}`,

    text,

    metadata: {
      course: first.metadata.course,

      module: first.metadata.module,

      lesson: first.metadata.lesson,

      lessonFile: first.metadata.lessonFile,

      source: first.metadata.source,

      chunkNumber,

      start: first.metadata.start,

      end: last.metadata.end,

      duration: +(last.metadata.end - first.metadata.start).toFixed(2),

      startTimestamp: first.metadata.startTimestamp,

      endTimestamp: last.metadata.endTimestamp,

      captionStart: first.metadata.captionIndex,

      captionEnd: last.metadata.captionIndex,

      tokenCount: countTokens(text),

      captions: captions.length,
    },
  };
}

if (!fs.existsSync(inputFolder)) {
  throw new Error("Parsed folder not found.");
}

walk(inputFolder);

console.log("\nFinished chunking.");
