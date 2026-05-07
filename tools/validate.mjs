// Sanity-check a generated questions.json.
//
//   node validate.mjs [path] [expectedCount]
//   default: ../questions.json, 400

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2] || resolve(__dirname, "..", "questions.json");
const expected = parseInt(process.argv[3] || "0", 10);

const data = JSON.parse(await readFile(path, "utf-8"));

const errors = [];
if (!Array.isArray(data)) errors.push("Root is not an array");
if (expected && data.length !== expected) {
  errors.push(`Expected ${expected} questions, got ${data.length}`);
}

const ids = new Set();
data.forEach((q, i) => {
  const where = `index ${i} (id=${q?.id})`;
  if (typeof q !== "object" || q === null) return errors.push(`${where}: not an object`);
  if (typeof q.question !== "string" || !q.question.trim()) errors.push(`${where}: missing question text`);
  if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 4) {
    errors.push(`${where}: choices must be length 2..4 (got ${q.choices?.length})`);
  } else q.choices.forEach((c, j) => {
    if (typeof c !== "string" || !c.trim()) errors.push(`${where}: choice ${j} is empty`);
  });
  if (!Number.isInteger(q.answer) || q.answer < 0 || (Array.isArray(q.choices) && q.answer >= q.choices.length)) {
    errors.push(`${where}: answer must be a valid index into choices`);
  }
  if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
  ids.add(q.id);
});

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log(`OK: ${data.length} questions, all valid.`);
