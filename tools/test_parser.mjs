// Smoke test the parser logic against a fake .docx-extracted text snippet.
// Run with: node test_parser.mjs

import assert from "node:assert/strict";

// Inline copy of the parse() function dependencies — keep in sync with parse_docx.mjs.
const RE_QUESTION_START = /^(?:Q(?:uestion)?\s*)?(\d+)\s*[.)\-:]\s*(.*)$/i;
const RE_CHOICE = /^(\*?)\s*([A-Da-d])\s*[.)\-:]\s*(.*)$/;
const RE_ANSWER = /^(?:Answer|Ans|Correct|Đáp\s*án|Đáp\s*?n)\s*[:\-]?\s*([A-Da-d])\b/i;
const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3 };

function normalizeLines(text) {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
}

function parse(text) {
  const lines = normalizeLines(text).filter((l) => l.length > 0);
  const questions = [];
  let cur = null;
  let starredAnswer = null;
  const finalize = () => {
    if (!cur) return;
    if (cur.choices.length !== 4) throw new Error("bad choices");
    if (cur.answer == null && starredAnswer != null) cur.answer = starredAnswer;
    if (cur.answer == null) throw new Error(`Q${cur.id} no answer`);
    questions.push(cur);
    cur = null;
    starredAnswer = null;
  };
  for (const line of lines) {
    const mAns = line.match(RE_ANSWER);
    if (mAns && cur && cur.choices.length === 4) {
      cur.answer = LETTER_TO_IDX[mAns[1].toUpperCase()];
      continue;
    }
    const mChoice = line.match(RE_CHOICE);
    if (mChoice && cur) {
      const starred = mChoice[1] === "*";
      const idx = LETTER_TO_IDX[mChoice[2].toUpperCase()];
      cur.choices[idx] = mChoice[3].trim();
      if (starred) starredAnswer = idx;
      continue;
    }
    const mQ = line.match(RE_QUESTION_START);
    if (mQ) {
      finalize();
      cur = { id: parseInt(mQ[1], 10), question: mQ[2].trim(), choices: [null, null, null, null], answer: null };
      continue;
    }
    if (cur && cur.choices.every((c) => c === null)) {
      cur.question = (cur.question + " " + line).trim();
    }
  }
  finalize();
  return questions;
}

const sample1 = `
1. What is the capital of Japan?
A. Seoul
B. Beijing
C. Tokyo
D. Bangkok
Answer: C

2) Which planet is the Red Planet?
A) Venus
B) Mars
C) Jupiter
D) Saturn
Answer: B
`;

const sample2 = `
Q1. What is 2 + 2?
A. 3
B. 4
C. 5
D. 6
Answer: B

Question 2: Which language is spoken in Brazil?
A. Spanish
*B. Portuguese
C. French
D. English
`;

const r1 = parse(sample1);
assert.equal(r1.length, 2);
assert.equal(r1[0].question, "What is the capital of Japan?");
assert.deepEqual(r1[0].choices, ["Seoul", "Beijing", "Tokyo", "Bangkok"]);
assert.equal(r1[0].answer, 2);
assert.equal(r1[1].answer, 1);

const r2 = parse(sample2);
assert.equal(r2.length, 2);
assert.equal(r2[0].answer, 1);
assert.equal(r2[1].answer, 1, "asterisk-marked answer");
assert.equal(r2[1].choices[1], "Portuguese");

console.log("parser tests passed.");
