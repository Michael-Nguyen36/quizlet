"use strict";

const STORAGE_KEY = "quiz.v1.state";
const SESSION_SIZE = 20;
const BOX_INTERVALS = [0, 1, 2, 4, 7, 14]; // index = box number; days between reviews

const screens = {
  home: document.getElementById("home"),
  session: document.getElementById("session"),
  summary: document.getElementById("summary"),
};

const els = {
  statDue: document.getElementById("stat-due"),
  statMastered: document.getElementById("stat-mastered"),
  statTotal: document.getElementById("stat-total"),
  boxBars: document.getElementById("box-bars"),
  startBtn: document.getElementById("start-btn"),
  startAllBtn: document.getElementById("start-all-btn"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  resetBtn: document.getElementById("reset-btn"),
  quitBtn: document.getElementById("quit-btn"),
  questionText: document.getElementById("question-text"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"),
  nextBtn: document.getElementById("next-btn"),
  progressFill: document.getElementById("progress-fill"),
  progressText: document.getElementById("progress-text"),
  sumCorrect: document.getElementById("sum-correct"),
  sumTotal: document.getElementById("sum-total"),
  wrongListContainer: document.getElementById("wrong-list-container"),
  wrongList: document.getElementById("wrong-list"),
  backHomeBtn: document.getElementById("back-home-btn"),
};

let questions = [];
let state = loadState();
let session = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { progress: {}, sessionCount: 0, lastSession: null };
    const parsed = JSON.parse(raw);
    parsed.progress ||= {};
    parsed.sessionCount ||= 0;
    parsed.lastSession ||= null;
    return parsed;
  } catch {
    return { progress: {}, sessionCount: 0, lastSession: null };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getOrInitProgress(qid) {
  if (!state.progress[qid]) {
    state.progress[qid] = {
      box: 1,
      lastSeenSession: null,
      lastSeenAt: null,
      timesCorrect: 0,
      timesWrong: 0,
    };
  }
  return state.progress[qid];
}

function isDue(qid, now) {
  const p = getOrInitProgress(qid);
  if (!p.lastSeenAt) return true;
  const intervalDays = BOX_INTERVALS[Math.min(p.box, BOX_INTERVALS.length - 1)];
  if (intervalDays === 0) return true;
  const elapsedMs = now - new Date(p.lastSeenAt).getTime();
  return elapsedMs >= intervalDays * 24 * 60 * 60 * 1000;
}

function fisherYates(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDueQuestions(limit) {
  const now = Date.now();
  const due = questions.filter((q) => isDue(q.id, now));
  // Prioritize lower boxes (less mastered) first.
  due.sort((a, b) => {
    const pa = getOrInitProgress(a.id).box;
    const pb = getOrInitProgress(b.id).box;
    return pa - pb;
  });
  // Within ties, randomize a bit by shuffling the whole list and re-sorting.
  const shuffled = fisherYates(due);
  shuffled.sort((a, b) => {
    const pa = getOrInitProgress(a.id).box;
    const pb = getOrInitProgress(b.id).box;
    return pa - pb;
  });
  return shuffled.slice(0, limit);
}

function pickRandomQuestions(limit) {
  return fisherYates(questions).slice(0, limit);
}

function renderHome() {
  const total = questions.length;
  const now = Date.now();
  const dueCount = questions.filter((q) => isDue(q.id, now)).length;
  const masteredCount = questions.filter((q) => getOrInitProgress(q.id).box >= 5).length;

  els.statTotal.textContent = total;
  els.statDue.textContent = dueCount;
  els.statMastered.textContent = masteredCount;

  // Box distribution bars
  const counts = [0, 0, 0, 0, 0]; // boxes 1..5
  for (const q of questions) {
    const b = getOrInitProgress(q.id).box;
    counts[Math.min(b, 5) - 1]++;
  }
  const max = Math.max(1, ...counts);
  els.boxBars.innerHTML = counts
    .map((c, i) => {
      const h = Math.round((c / max) * 100);
      return `<div class="box-col" data-box="${i + 1}">
        <span class="count">${c}</span>
        <div class="bar"><div class="fill" style="height:${h}%"></div></div>
        <span class="label">B${i + 1}</span>
      </div>`;
    })
    .join("");
}

function show(screenName) {
  for (const [name, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", name !== screenName);
  }
}

function startSession(mode = "due") {
  const picked = mode === "all"
    ? pickRandomQuestions(SESSION_SIZE)
    : pickDueQuestions(SESSION_SIZE);

  if (picked.length === 0) {
    // Nothing due — fall back to lowest-box practice.
    const fallback = fisherYates(questions)
      .sort((a, b) => getOrInitProgress(a.id).box - getOrInitProgress(b.id).box)
      .slice(0, SESSION_SIZE);
    if (fallback.length === 0) {
      alert("No questions loaded.");
      return;
    }
    session = makeSession(fallback);
  } else {
    session = makeSession(picked);
  }

  state.sessionCount = (state.sessionCount || 0) + 1;
  state.lastSession = new Date().toISOString();
  saveState();

  show("session");
  renderQuestion();
}

function makeSession(qs) {
  return {
    items: qs.map((q) => ({
      q,
      shuffledIndices: fisherYates(q.choices.map((_, i) => i)),
      answeredIdx: null,
      correct: null,
    })),
    cursor: 0,
    correctCount: 0,
    wrong: [],
  };
}

function renderQuestion() {
  const item = session.items[session.cursor];
  els.questionText.textContent = item.q.question;

  els.choices.innerHTML = "";
  els.feedback.classList.add("hidden");
  els.feedback.className = "feedback hidden";
  els.nextBtn.classList.add("hidden");

  const letters = ["A", "B", "C", "D"];
  item.shuffledIndices.forEach((origIdx, displayIdx) => {
    const li = document.createElement("li");
    li.className = "choice";
    li.dataset.origIdx = String(origIdx);
    li.innerHTML = `<span class="letter">${letters[displayIdx]}</span><span class="text"></span>`;
    li.querySelector(".text").textContent = item.q.choices[origIdx];
    li.addEventListener("click", () => onAnswer(displayIdx, origIdx));
    els.choices.appendChild(li);
  });

  const total = session.items.length;
  const done = session.cursor;
  els.progressFill.style.width = `${(done / total) * 100}%`;
  els.progressText.textContent = `${done + 1} / ${total}`;
}

function onAnswer(displayIdx, origIdx) {
  const item = session.items[session.cursor];
  if (item.answeredIdx !== null) return;
  item.answeredIdx = origIdx;
  const correct = origIdx === item.q.answer;
  item.correct = correct;

  // Disable & paint
  const liEls = els.choices.querySelectorAll(".choice");
  liEls.forEach((li) => li.classList.add("disabled"));
  liEls.forEach((li) => {
    const oi = Number(li.dataset.origIdx);
    if (oi === item.q.answer) li.classList.add("correct");
    else if (oi === origIdx) li.classList.add("wrong");
  });

  // Update Leitner progress
  const p = getOrInitProgress(item.q.id);
  p.lastSeenSession = state.sessionCount;
  p.lastSeenAt = new Date().toISOString();
  if (correct) {
    p.timesCorrect++;
    p.box = Math.min(5, p.box + 1);
    session.correctCount++;
  } else {
    p.timesWrong++;
    p.box = 1;
    session.wrong.push(item.q);
  }
  saveState();

  els.feedback.classList.remove("hidden");
  els.feedback.classList.add(correct ? "correct" : "wrong");
  els.feedback.textContent = correct ? "Correct" : "Incorrect";
  els.nextBtn.classList.remove("hidden");
  els.nextBtn.textContent = session.cursor === session.items.length - 1 ? "Finish" : "Next";
}

function nextQuestion() {
  if (session.cursor < session.items.length - 1) {
    session.cursor++;
    renderQuestion();
  } else {
    finishSession();
  }
}

function finishSession() {
  els.sumCorrect.textContent = session.correctCount;
  els.sumTotal.textContent = session.items.length;

  if (session.wrong.length > 0) {
    els.wrongListContainer.classList.remove("hidden");
    els.wrongList.innerHTML = session.wrong
      .map((q) => {
        const correctText = q.choices[q.answer];
        return `<li><div class="q"></div><div class="a"></div></li>`;
      })
      .join("");
    // Set textContent safely after innerHTML scaffolding
    [...els.wrongList.querySelectorAll("li")].forEach((li, i) => {
      const q = session.wrong[i];
      li.querySelector(".q").textContent = q.question;
      li.querySelector(".a").textContent = "Answer: " + q.choices[q.answer];
    });
  } else {
    els.wrongListContainer.classList.add("hidden");
  }

  show("summary");
}

function quitSession() {
  if (!session) return;
  if (session.cursor > 0 || session.items[0].answeredIdx !== null) {
    if (!confirm("Quit this session? Progress for answered questions is saved.")) return;
  }
  session = null;
  renderHome();
  show("home");
}

function exportProgress() {
  const json = JSON.stringify(state, null, 2);
  navigator.clipboard?.writeText(json).then(
    () => alert("Progress copied to clipboard."),
    () => prompt("Copy this to back up your progress:", json)
  );
}

function importProgress() {
  const raw = prompt("Paste exported progress JSON:");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed.progress) throw new Error("Invalid shape");
    state = {
      progress: parsed.progress,
      sessionCount: parsed.sessionCount || 0,
      lastSession: parsed.lastSession || null,
    };
    saveState();
    renderHome();
    alert("Progress imported.");
  } catch (e) {
    alert("Could not import: " + e.message);
  }
}

function resetProgress() {
  if (!confirm("Erase all progress? This cannot be undone.")) return;
  state = { progress: {}, sessionCount: 0, lastSession: null };
  saveState();
  renderHome();
}

async function loadQuestions() {
  const res = await fetch("questions.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Failed to load questions.json");
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("questions.json must be an array");
  questions = data.map((q, i) => ({
    id: q.id ?? i + 1,
    question: q.question,
    choices: q.choices,
    answer: q.answer,
  }));
}

function bind() {
  els.startBtn.addEventListener("click", () => startSession("due"));
  els.startAllBtn.addEventListener("click", () => startSession("all"));
  els.nextBtn.addEventListener("click", nextQuestion);
  els.quitBtn.addEventListener("click", quitSession);
  els.backHomeBtn.addEventListener("click", () => {
    session = null;
    renderHome();
    show("home");
  });
  els.exportBtn.addEventListener("click", exportProgress);
  els.importBtn.addEventListener("click", importProgress);
  els.resetBtn.addEventListener("click", resetProgress);
}

async function main() {
  bind();
  try {
    await loadQuestions();
  } catch (e) {
    document.body.innerHTML = `<main style="padding:24px;font-family:system-ui"><h1>Error</h1><p>Could not load <code>questions.json</code>.</p><pre>${e.message}</pre></main>`;
    return;
  }
  renderHome();
  show("home");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

main();
