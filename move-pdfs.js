const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();
const PDF_DIR = path.join(ROOT, "PDFS");

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

// Only match four-digit PDF filenames directly in ROOT.
const files = fs
  .readdirSync(ROOT)
  .filter(file => /^\d{4}\.pdf$/.test(file));

if (!files.length) {
  console.log("No PDFs to move in root folder.");
  process.exit(0);
}

console.log(`Found PDFs to move: ${files.join(", ")}`);

for (const file of files) {
  const oldPath = path.join(ROOT, file);
  const newPath = path.join(PDF_DIR, file);

  console.log(`Moving ${file} -> PDFS/`);

  // Filesystem rename preserves the PDF binary exactly.
  fs.renameSync(oldPath, newPath);
}

// Stage both the deleted root files and the new PDFS files.
execSync("git add -A -- . ':!move-pdfs.js'", {
  stdio: "inherit"
});

// Check whether anything is actually staged.
try {
  execSync("git diff --cached --quiet", { stdio: "ignore" });

  console.log("No Git changes to commit.");
  process.exit(0);
} catch {
  // Exit code 1 means staged changes exist - continue.
}

execSync(
  `git commit -m "Move ${files.length} PDF(s) to PDFS folder"`,
  { stdio: "inherit" }
);

console.log(
  `Moved and committed ${files.length} PDF(s) into PDFS folder.`
);
