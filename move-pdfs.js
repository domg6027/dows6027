import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const files = fs.readdirSync(ROOT).filter(f => /^\d{4}\.pdf$/.test(f));

if (!files.length) {
  console.log("✅ No PDFs to move in root folder");
  process.exit(0);
}

console.log(`➡ Found PDFs to move: ${files.join(", ")}`);

for (const file of files) {
  const oldPath = path.join(ROOT, file);
  const newPath = path.join(PDF_DIR, file);

  console.log(`➡ Moving ${file} → PDFS/`);

  fs.renameSync(oldPath, newPath);

  // ✅ IMPORTANT: stage BOTH sides of the move
  execSync(`git add "${oldPath}" "${newPath}"`);
}

// ✅ Now commit EVERYTHING
execSync(`git commit -am "Move ${files.length} PDF(s) to PDFS folder"`);

console.log(`✅ Moved and committed ${files.length} PDF(s) into PDFS folder`);
