// onepdf.js
import fs from "fs";
import path from "path";
import { Generator } from "@pdfme/generator";
import fetch from "node-fetch";

export async function generateOnePDF(articleNumber, url) {
  console.log(`📄 Generating PDF for article ${articleNumber}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch article ${articleNumber}`);
  }

  const html = await res.text(); // ENTIRE HTML, ads included

  const template = {
    basePdf: null,
    schemas: [
      {
        content: {
          type: "html",
          position: { x: 0, y: 0 },
          width: 210,
          height: 297
        }
      }
    ]
  };

  const inputs = [
    {
      content: html
    }
  ];

  const pdf = await Generator.generate({
    template,
    inputs
  });

  const outDir = path.join("pdfs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outPath = path.join(outDir, `PNW-${articleNumber}.pdf`);
  fs.writeFileSync(outPath, pdf);

  console.log(`✅ Saved ${outPath}`);
}
