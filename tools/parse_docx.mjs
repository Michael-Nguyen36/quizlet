// Parse a .docx of multiple-choice questions into questions.json.
//
// Usage:
//   node parse_docx.mjs [input.docx] [output.json]
//   defaults: ../source.docx, ../questions.json
//
// This parser handles three answer-marking styles in the source doc:
//   1) The correct choice is in BOLD or ITALIC (or both) — common in Word docs
//      created by copying answers into a different style. This is the format
//      used by the Vietnamese banking question bank.
//   2) "Answer: B" line below the four choices.
//   3) "*B." preceding the correct choice text.
//
// To detect (1) we use mammoth.convertToHtml and look for <strong>/<em> tags
// inside the paragraph for that choice.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputArg = process.argv[2] || resolve(__dirname, "..", "source.docx");
const outputArg = process.argv[3] || resolve(__dirname, "..", "questions.json");

const RE_QUESTION_START = /^(?:Q(?:uestion)?\s*)?(\d+)\s*[.)\-:]\s*(.*)$/i;
const RE_CHOICE = /^(\*?)\s*([A-Da-d])\s*[.)\-:]\s*(.*)$/;
const RE_ANSWER = /^(?:Answer|Ans|Correct|Đáp\s*án|Đáp\s*?n)\s*[:\-]?\s*([A-Da-d])\b/i;
const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3 };

function stripHtml(s) {
  return s
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphIsEmphasized(html) {
  // Treat a paragraph as "marked correct" if it contains <strong> or <em>
  // (i.e. bold or italic) anywhere — that's how the source doc flags answers.
  return /<(strong|b|em|i)\b/i.test(html);
}

function splitParagraphs(html) {
  // mammoth emits <p>...</p> for each paragraph, occasionally with no inner
  // text (image-only). Split on <p>/</p> tags.
  const parts = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) parts.push(m[1]);
  return parts;
}

function parse(html) {
  const paragraphs = splitParagraphs(html)
    .map((p) => ({ html: p, text: stripHtml(p) }))
    .filter((p) => p.text.length > 0);

  const questions = [];
  const skipped = [];
  let cur = null;

  const finalize = () => {
    if (!cur) return;
    // Compact null slots — questions with fewer than 4 choices are kept and
    // shown as-is. We preserve the answer by remapping its index after compaction.
    const present = [];
    let remappedAnswer = null;
    cur.choices.forEach((c, idx) => {
      if (c != null) {
        if (cur.answer === idx) remappedAnswer = present.length;
        present.push(c);
      }
    });
    cur.choices = present;
    if (remappedAnswer !== null) cur.answer = remappedAnswer;

    if (cur.choices.length < 2) {
      skipped.push({ id: cur.id, reason: `only ${cur.choices.length} choice(s)`, q: cur.question });
      cur = null;
      return;
    }
    if (cur.answer == null) {
      skipped.push({ id: cur.id, reason: "no answer marked (no bold/italic)", q: cur.question });
      cur = null;
      return;
    }
    questions.push(cur);
    cur = null;
  };

  for (const p of paragraphs) {
    const { text, html: innerHtml } = p;

    // 1) Answer line ("Answer: C", "Đáp án: B")
    const mAns = text.match(RE_ANSWER);
    if (mAns && cur && cur.choices.every((c) => c != null)) {
      cur.answer = LETTER_TO_IDX[mAns[1].toUpperCase()];
      continue;
    }

    // 2) Choice line ("a) text", "*B. text")
    const mChoice = text.match(RE_CHOICE);
    if (mChoice && cur) {
      const starred = mChoice[1] === "*";
      const letter = mChoice[2].toUpperCase();
      const choiceText = mChoice[3].trim();
      const idx = LETTER_TO_IDX[letter];
      cur.choices[idx] = choiceText;
      if (starred || paragraphIsEmphasized(innerHtml)) {
        cur.answer = idx;
      }
      continue;
    }

    // 3) Question start line ("1. ..." / "Q1: ...")
    const mQ = text.match(RE_QUESTION_START);
    if (mQ) {
      // Only start a new question if the previous one already has at least
      // one choice, or there is no current question. This guards against a
      // numbered line inside a question stem being misread as a new question.
      const prevHasAChoice = !cur || cur.choices.some((c) => c != null);
      if (prevHasAChoice) {
        finalize();
        cur = {
          id: parseInt(mQ[1], 10),
          question: mQ[2].trim(),
          choices: [null, null, null, null],
          answer: null,
        };
        continue;
      }
    }

    // Otherwise: continuation of the question stem, before any choices arrived.
    if (cur && cur.choices.every((c) => c == null)) {
      cur.question = (cur.question + " " + text).trim();
    }
  }

  finalize();
  return { questions, skipped };
}

async function main() {
  console.log(`Reading: ${inputArg}`);
  const buffer = await readFile(inputArg);
  const { value: html, messages } = await mammoth.convertToHtml({ buffer });
  for (const m of messages) {
    if (m.type === "warning") console.warn("mammoth warning:", m.message);
  }

  const { questions, skipped } = parse(html);

  // Preserve original source numbering as `sourceId`, but reassign sequential
  // `id` so the app has a contiguous range.
  questions.forEach((q, i) => {
    q.sourceId = q.id;
    q.id = i + 1;
  });

  await writeFile(outputArg, JSON.stringify(questions, null, 2), "utf-8");
  console.log(`Wrote ${questions.length} questions → ${outputArg}`);

  if (skipped.length > 0) {
    console.warn(`\nSkipped ${skipped.length} malformed question(s) — fix the .docx and re-run:`);
    for (const s of skipped) {
      console.warn(`  - Q${s.id} (${s.reason}): ${s.q.slice(0, 100)}`);
    }
  }

  // Quick distribution snapshot.
  const byAnswer = [0, 0, 0, 0];
  for (const q of questions) byAnswer[q.answer]++;
  console.log(`\nAnswer distribution: A=${byAnswer[0]} B=${byAnswer[1]} C=${byAnswer[2]} D=${byAnswer[3]}`);
}

main().catch((e) => {
  console.error("Parse failed:", e.message);
  process.exit(1);
});
