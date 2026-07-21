import fs from "fs";
import path from "node:path";

const sourceDir = "./course"; // Original folder
const destinationDir = "./subtitles"; // Output folder

function copySubtitles(src, dest) {
  const items = fs.readdirSync(src, { withFileTypes: true });

  for (const item of items) {
    const srcPath = path.join(src, item.name);
    const relativePath = path.relative(sourceDir, srcPath);
    const destPath = path.join(destinationDir, relativePath);

    if (item.isDirectory()) {
      copySubtitles(srcPath, dest);
    } else {
      const ext = path.extname(item.name).toLowerCase();

      if (ext === ".vtt") {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied: ${relativePath}`);
      }
    }
  }
}

copySubtitles(sourceDir, destinationDir);
console.log("Done!");
