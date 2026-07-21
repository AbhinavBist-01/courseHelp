import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webvtt from "node-webvtt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COURSE_NAME = "Mobile Development with Expo";

const inputFolder = path.join(__dirname, "subtitles");
const outputFolder = path.join(__dirname, "parsed");

const allCaptions = [];

/* ----------------------- Helpers ----------------------- */

function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = (seconds % 60).toFixed(3);

  return (
    String(hrs).padStart(2, "0") +
    ":" +
    String(mins).padStart(2, "0") +
    ":" +
    secs.padStart(6, "0")
  );
}

function cleanText(text) {
  return text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function estimateTokens(text) {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

function ensureDirectoryExists(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/* ----------------------- Parser ----------------------- */

function parseFolder(folder) {
  const entries = fs.readdirSync(folder, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      parseFolder(fullPath);
      continue;
    }

    if (path.extname(entry.name).toLowerCase() !== ".vtt") continue;

    const content = fs.readFileSync(fullPath, "utf8");
    const parsed = webvtt.parse(content);

    const relativePath = path.relative(inputFolder, fullPath);

    // Normalize path separators
    const normalizedPath = relativePath.replace(/\\/g, "/");

    const parts = normalizedPath.split("/");

    /**
     * subtitles/
     *    module 1/
     *        lesson/
     *            file.vtt
     */

    const moduleName =
      parts.find((p) => /^module\s+\d+/i.test(p)) ?? parts[0] ?? "Unknown";

    const lessonFolder = parts.at(-2);

    const lessonName = path.basename(fullPath, ".vtt");

    const captions = parsed.cues.map((cue, index) => {
      const text = cleanText(cue.text);

      const caption = {
        id: `${lessonName}_${String(index + 1).padStart(4, "0")}`,

        text,

        metadata: {
          course: COURSE_NAME,

          module: moduleName,

          lesson: lessonFolder || lessonName,

          lessonFile: lessonName,

          source: normalizedPath,

          fileName: path.basename(fullPath),

          captionIndex: index + 1,

          start: cue.start,
          end: cue.end,
          duration: +(cue.end - cue.start).toFixed(3),

          startTimestamp: formatTimestamp(cue.start),

          endTimestamp: formatTimestamp(cue.end),

          estimatedTokens: estimateTokens(text),
        },
      };

      allCaptions.push(caption);

      return caption;
    });

    const outputPath = path.join(
      outputFolder,
      normalizedPath.replace(".vtt", ".json"),
    );

    ensureDirectoryExists(path.dirname(outputPath));

    fs.writeFileSync(outputPath, JSON.stringify(captions, null, 2));

    console.log(`✔ Parsed ${normalizedPath} (${captions.length} captions)`);
  }
}

/* ----------------------- Run ----------------------- */

if (!fs.existsSync(inputFolder)) {
  throw new Error(`Input folder not found:\n${inputFolder}`);
}

parseFolder(inputFolder);

// Save one master JSON containing all captions
fs.writeFileSync(
  path.join(outputFolder, "captions.json"),
  JSON.stringify(allCaptions, null, 2),
);

console.log("\n====================================");
console.log(
  `Lessons Parsed : ${new Set(allCaptions.map((c) => c.metadata.lessonFile)).size}`,
);
console.log(`Total Captions : ${allCaptions.length}`);
console.log(`Master JSON    : parsed/captions.json`);
console.log("====================================");
