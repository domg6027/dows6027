import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");

// 1️⃣ Ensure PDFS folder exists
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

// 2️⃣ Find all PDFs in root (nnnn.pdf pattern)
const files = fs.readdirSync(ROOT).filter(f => /^\d{4}\.pdf$/.test(f));

if (!files.length) {
  console.log("✅ No PDFs to move in root folder");
  process.exit(0);
}

console.log(`➡ Found PDFs to move: ${files.join(", ")}`);

// 3️⃣ Move files using fs and git
for (const file of files) {
  const oldPath = path.join(ROOT, file);
  const newPath = path.join(PDF_DIR, file);
  fs.renameSync(oldPath, newPath);
  execSync(`git add "${newPath}"`);
}

if (files.length) {
  execSync(`git commit -m "Move ${files.length} PDF(s) to PDFS folder"`);
  console.log(`✅ Moved ${files.length} PDF(s) into PDFS folder and committed`);
} else {
  console.log("⚠ No PDFs were moved");
}
