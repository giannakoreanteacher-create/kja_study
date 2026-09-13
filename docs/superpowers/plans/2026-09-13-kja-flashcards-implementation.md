# 한국어 단어 Quizlet(단어카드) 웹사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/Express-served, vanilla-JS flashcard site over the 5,965-word Korean vocabulary list (levels A/B/C), with random-order study capped at 30 new words/day/level, flip-to-reveal English meaning, swipe-to-grade, and a per-level persistent "don't know" review queue in localStorage.

**Architecture:** Static frontend (`public/index.html` + `public/style.css` + `public/app.js` + `public/words.js`) served by a minimal Express server with zero API routes. All state (today's count, seen words, wrong words) lives in the browser's localStorage, one key per level. A one-time, offline data-prep pipeline (Python, not shipped) turns the source `.xls` into `public/words.js`.

**Tech Stack:** Node.js + Express (server only), vanilla JS (no frontend framework, no build step), Node's built-in test runner (`node --test`) for logic unit tests, Python + `xlrd` for one-time source-data parsing (dev-only, not deployed).

## Global Constraints

- No new frontend dependencies: no framework, no bundler/build step, no CSS library.
- Server has no API routes and uses no API keys — `express.static` only.
- Server must listen on `process.env.PORT || 5000` (Render assigns `PORT`; local default is 5000 per user request).
- Word counts must match source exactly: level A = 982, level B = 2,111, level C = 2,872, total = 5,965.
- Word `id` must be the array index in `public/words.js` (the source "순위" column has 67 duplicate values, so it cannot be used as a unique id — confirmed during brainstorming).
- localStorage key per level: `kja_progress_A`, `kja_progress_B`, `kja_progress_C`. Shape: `{ seenIds: number[], wrongIds: number[], today: "YYYY-MM-DD", todayCount: number }`.
- Daily new-word cap: 30 per level, independent per level.
- No mid-session "batch of 10" interruption — study screen shows one continuous queue (up to the day's remaining cap) per the user's later revision.
- Visual style: Toss-style (generous whitespace, large rounded corners, soft shadows, big tap targets), baby-pink accent color (not gray+blue), clean sans-serif (system font stack or Pretendard).
- Test tooling: use Node's built-in `assert` + `node --test` only — do not add jest/mocha/supertest.

---

## File Structure

```
kja_study/
├── data-prep/                        # one-time, NOT shipped to the server
│   ├── parse_source.py
│   ├── words_raw.json                # generated
│   └── words_with_meanings.json      # generated (Task 2 deliverable)
├── scripts/
│   └── build-words-js.js             # data-prep/words_with_meanings.json -> public/words.js
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── progress.js                   # pure logic, no DOM — unit tested
│   └── words.js                      # generated, committed
├── server.js
├── package.json
├── .gitignore
└── README.md
```

---

### Task 1: Parse source spreadsheet into raw JSON

**Files:**
- Create: `data-prep/parse_source.py`
- Test: `data-prep/words_raw.json` (generated output, validated inline by the script)

**Interfaces:**
- Produces: `data-prep/words_raw.json` — a JSON array of `{ word: string, pos: string, level: "A"|"B"|"C" }`, length 5965, in the original 가나다순 file order.

- [ ] **Step 1: Write the parser script**

```python
# data-prep/parse_source.py
import json
import xlrd

SRC = "한국어 학습용 어휘 목록.xls"
OUT = "data-prep/words_raw.json"

wb = xlrd.open_workbook(SRC)
sheet = wb.sheet_by_index(0)

rows = []
for r in range(1, sheet.nrows):  # skip header row
    word = sheet.cell_value(r, 1)
    pos = sheet.cell_value(r, 2)
    level = sheet.cell_value(r, 4)
    rows.append({"word": word, "pos": pos, "level": level})

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)

counts = {"A": 0, "B": 0, "C": 0}
for row in rows:
    counts[row["level"]] += 1

assert len(rows) == 5965, f"expected 5965 rows, got {len(rows)}"
assert counts == {"A": 982, "B": 2111, "C": 2872}, f"level counts mismatch: {counts}"
print("OK:", len(rows), counts)
```

- [ ] **Step 2: Run it and verify the assertions pass**

Run: `python data-prep/parse_source.py`
Expected output: `OK: 5965 {'A': 982, 'B': 2111, 'C': 2872}`

- [ ] **Step 3: Commit**

```bash
git add data-prep/parse_source.py data-prep/words_raw.json
git commit -m "Add source spreadsheet parser and raw word dump"
```

---

### Task 2: Generate English meanings for all 5,965 words

This task has no deterministic code — it's a content-authoring task. The deliverable and its acceptance test are both exact and machine-checkable below.

**Files:**
- Create: `data-prep/words_with_meanings.json`
- Create: `data-prep/validate_meanings.py`

**Interfaces:**
- Consumes: `data-prep/words_raw.json` (from Task 1) — array of `{ word, pos, level }`, length 5965, in file order.
- Produces: `data-prep/words_with_meanings.json` — array of the **same length and same order** as `words_raw.json`, each element `{ word, pos, level, meaning: string }`, where `meaning` is a short English gloss (e.g. `"shop / store"`, `"to be close / near"`). Order must be preserved 1:1 (index `i` in both files describes the same word) — later tasks depend on this alignment.

- [ ] **Step 1: Generate the meanings**

Read `data-prep/words_raw.json`. For every entry, write a short, natural English gloss for that Korean word given its part of speech (품사: 명=noun, 동=verb, 형=adjective, 부=adverb, etc.). Where the same 단어 text appears more than once with a different 품사 or a disambiguating suffix (e.g. `가로01` vs the plain `가로`), give each occurrence its own distinct meaning matching that specific sense — do not just copy the previous occurrence's gloss. Process in batches (e.g. ~300 words at a time) and append to `data-prep/words_with_meanings.json`, preserving original order, until all 5,965 are covered.

- [ ] **Step 2: Write the validation script**

```python
# data-prep/validate_meanings.py
import json

with open("data-prep/words_raw.json", encoding="utf-8") as f:
    raw = json.load(f)
with open("data-prep/words_with_meanings.json", encoding="utf-8") as f:
    withm = json.load(f)

assert len(raw) == len(withm) == 5965, f"length mismatch: raw={len(raw)} withm={len(withm)}"

for i, (r, w) in enumerate(zip(raw, withm)):
    assert r["word"] == w["word"], f"word mismatch at {i}: {r['word']} != {w['word']}"
    assert r["pos"] == w["pos"], f"pos mismatch at {i}"
    assert r["level"] == w["level"], f"level mismatch at {i}"
    meaning = w.get("meaning", "").strip()
    assert meaning, f"empty meaning at index {i} for word {w['word']}"

print("OK: all", len(withm), "entries have a non-empty, order-aligned meaning")
```

- [ ] **Step 3: Run the validation and fix any failures**

Run: `python data-prep/validate_meanings.py`
Expected output: `OK: all 5965 entries have a non-empty, order-aligned meaning`
If it raises an `AssertionError`, fix the flagged entry in `words_with_meanings.json` and re-run until it passes.

- [ ] **Step 4: Commit**

```bash
git add data-prep/words_with_meanings.json data-prep/validate_meanings.py
git commit -m "Generate English meanings for all 5965 vocabulary words"
```

---

### Task 3: Build `public/words.js` from the meanings file

**Files:**
- Create: `scripts/build-words-js.js`
- Create: `public/words.js` (generated)
- Test: `scripts/build-words-js.test.js`

**Interfaces:**
- Consumes: `data-prep/words_with_meanings.json` (from Task 2).
- Produces: `public/words.js` defining a global `WORDS` array (browser) and exporting the same array via `module.exports` (Node), each element shaped `{ id: number, word: string, pos: string, meaning: string, level: "A"|"B"|"C" }` where `id` is the array index.

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/build-words-js.test.js
const test = require('node:test');
const assert = require('node:assert');
const { execSync } = require('node:child_process');
const fs = require('node:fs');

test('build-words-js produces a valid public/words.js', () => {
  execSync('node scripts/build-words-js.js', { stdio: 'inherit' });

  assert.ok(fs.existsSync('public/words.js'), 'public/words.js should exist');

  delete require.cache[require.resolve('../public/words.js')];
  const WORDS = require('../public/words.js');

  assert.strictEqual(WORDS.length, 5965);

  const counts = { A: 0, B: 0, C: 0 };
  const seenIds = new Set();
  WORDS.forEach((w, i) => {
    assert.strictEqual(w.id, i, `id ${w.id} should equal index ${i}`);
    assert.ok(!seenIds.has(w.id), `duplicate id ${w.id}`);
    seenIds.add(w.id);
    assert.ok(w.meaning && w.meaning.length > 0, `word ${w.word} missing meaning`);
    counts[w.level] += 1;
  });
  assert.deepStrictEqual(counts, { A: 982, B: 2111, C: 2872 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/build-words-js.test.js`
Expected: FAIL (`scripts/build-words-js.js` does not exist yet / `public/words.js` not found)

- [ ] **Step 3: Write the build script**

```javascript
// scripts/build-words-js.js
const fs = require('node:fs');

const source = JSON.parse(fs.readFileSync('data-prep/words_with_meanings.json', 'utf-8'));

const words = source.map((w, i) => ({
  id: i,
  word: w.word,
  pos: w.pos,
  meaning: w.meaning,
  level: w.level,
}));

const header = '// Generated by scripts/build-words-js.js — do not edit by hand.\n';
const body = `const WORDS = ${JSON.stringify(words, null, 0)};\n`;
const footer = `if (typeof module !== 'undefined') { module.exports = WORDS; }\n`;

fs.writeFileSync('public/words.js', header + body + footer);
console.log(`Wrote public/words.js with ${words.length} words.`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/build-words-js.test.js`
Expected: PASS (1 passing test)

- [ ] **Step 5: Commit**

```bash
git add scripts/build-words-js.js scripts/build-words-js.test.js public/words.js
git commit -m "Add words.js build script and generate public/words.js"
```

---

### Task 4: Progress logic module (`public/progress.js`)

Pure functions, no DOM access, so they're unit-testable directly with `node --test`. `app.js` (Task 7) will call these from the browser; tests here pass in a plain object as the "storage" instead of `window.localStorage`.

**Files:**
- Create: `public/progress.js`
- Test: `public/progress.test.js`

**Interfaces:**
- Produces (all exported via `module.exports` and also attached to `window` when `window` exists):
  - `todayString(date = new Date())` → `"YYYY-MM-DD"`
  - `defaultState()` → `{ seenIds: [], wrongIds: [], today: todayString(), todayCount: 0 }`
  - `loadState(storage, level)` → parses `storage.getItem('kja_progress_' + level)`, returns `defaultState()` if missing/invalid, and resets `todayCount` to 0 (keeping `seenIds`/`wrongIds`) if the stored `today` isn't today's date.
  - `saveState(storage, level, state)` → `storage.setItem('kja_progress_' + level, JSON.stringify(state))`
  - `buildQueue(allLevelWords, state, dailyCap = 30)` → returns an array of word objects: shuffled unseen words (by `id` not in `state.seenIds`), truncated to `Math.max(0, dailyCap - state.todayCount)`.
  - `recordAnswer(state, wordId, knows)` → returns a **new** state object with `wordId` added to `seenIds` (if absent) and `todayCount` incremented (only the first time that id is newly seen this call), and `wordId` added to `wrongIds` if `!knows`, or removed from `wrongIds` if `knows`.

- [ ] **Step 1: Write the failing tests**

```javascript
// public/progress.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  todayString,
  defaultState,
  loadState,
  saveState,
  buildQueue,
  recordAnswer,
} = require('./progress.js');

function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    _dump: () => store,
  };
}

test('todayString formats as YYYY-MM-DD', () => {
  const d = new Date(2026, 8, 13); // Sep 13 2026 (month is 0-indexed)
  assert.strictEqual(todayString(d), '2026-09-13');
});

test('loadState returns default state when nothing stored', () => {
  const storage = fakeStorage();
  const state = loadState(storage, 'A');
  assert.deepStrictEqual(state, defaultState());
});

test('loadState resets todayCount on a new day, keeps seen/wrong', () => {
  const storage = fakeStorage({
    kja_progress_A: JSON.stringify({
      seenIds: [1, 2], wrongIds: [2], today: '2000-01-01', todayCount: 30,
    }),
  });
  const state = loadState(storage, 'A');
  assert.strictEqual(state.todayCount, 0);
  assert.deepStrictEqual(state.seenIds, [1, 2]);
  assert.deepStrictEqual(state.wrongIds, [2]);
  assert.notStrictEqual(state.today, '2000-01-01');
});

test('saveState persists and loadState reads it back (same day)', () => {
  const storage = fakeStorage();
  const state = { seenIds: [5], wrongIds: [], today: todayString(), todayCount: 1 };
  saveState(storage, 'B', state);
  const loaded = loadState(storage, 'B');
  assert.deepStrictEqual(loaded, state);
});

test('buildQueue excludes seen words and respects remaining daily cap', () => {
  const words = [
    { id: 0, level: 'A' }, { id: 1, level: 'A' }, { id: 2, level: 'A' },
    { id: 3, level: 'A' }, { id: 4, level: 'A' },
  ];
  const state = { seenIds: [0, 1], wrongIds: [], today: todayString(), todayCount: 28 };
  const queue = buildQueue(words, state, 30);
  assert.strictEqual(queue.length, 2); // only 2 slots left today
  queue.forEach((w) => assert.ok(![0, 1].includes(w.id)));
});

test('buildQueue returns empty array when daily cap already reached', () => {
  const words = [{ id: 0, level: 'A' }, { id: 1, level: 'A' }];
  const state = { seenIds: [], wrongIds: [], today: todayString(), todayCount: 30 };
  assert.deepStrictEqual(buildQueue(words, state, 30), []);
});

test('recordAnswer(knows=false) adds to wrongIds and seenIds, increments todayCount once', () => {
  let state = defaultState();
  state = recordAnswer(state, 7, false);
  assert.deepStrictEqual(state.wrongIds, [7]);
  assert.deepStrictEqual(state.seenIds, [7]);
  assert.strictEqual(state.todayCount, 1);

  // seeing the same word again should not double-count today
  state = recordAnswer(state, 7, true);
  assert.strictEqual(state.todayCount, 1);
});

test('recordAnswer(knows=true) removes an existing id from wrongIds', () => {
  let state = { seenIds: [7], wrongIds: [7], today: todayString(), todayCount: 1 };
  state = recordAnswer(state, 7, true);
  assert.deepStrictEqual(state.wrongIds, []);
  assert.deepStrictEqual(state.seenIds, [7]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test public/progress.test.js`
Expected: FAIL (`Cannot find module './progress.js'`)

- [ ] **Step 3: Implement `public/progress.js`**

```javascript
// public/progress.js
function todayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultState() {
  return { seenIds: [], wrongIds: [], today: todayString(), todayCount: 0 };
}

function loadState(storage, level) {
  const raw = storage.getItem('kja_progress_' + level);
  if (!raw) return defaultState();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultState();
  }
  if (!parsed || !Array.isArray(parsed.seenIds) || !Array.isArray(parsed.wrongIds)) {
    return defaultState();
  }

  const today = todayString();
  if (parsed.today !== today) {
    return { seenIds: parsed.seenIds, wrongIds: parsed.wrongIds, today, todayCount: 0 };
  }
  return parsed;
}

function saveState(storage, level, state) {
  storage.setItem('kja_progress_' + level, JSON.stringify(state));
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue(allLevelWords, state, dailyCap = 30) {
  const remaining = Math.max(0, dailyCap - state.todayCount);
  if (remaining === 0) return [];
  const seen = new Set(state.seenIds);
  const unseen = allLevelWords.filter((w) => !seen.has(w.id));
  return shuffle(unseen).slice(0, remaining);
}

function recordAnswer(state, wordId, knows) {
  const seenIds = state.seenIds.includes(wordId)
    ? state.seenIds
    : [...state.seenIds, wordId];
  const isNewToday = !state.seenIds.includes(wordId);

  let wrongIds;
  if (knows) {
    wrongIds = state.wrongIds.filter((id) => id !== wordId);
  } else {
    wrongIds = state.wrongIds.includes(wordId) ? state.wrongIds : [...state.wrongIds, wordId];
  }

  return {
    seenIds,
    wrongIds,
    today: state.today,
    todayCount: state.todayCount + (isNewToday ? 1 : 0),
  };
}

const api = { todayString, defaultState, loadState, saveState, buildQueue, recordAnswer };
if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') Object.assign(window, api);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test public/progress.test.js`
Expected: PASS (8 passing tests)

- [ ] **Step 5: Commit**

```bash
git add public/progress.js public/progress.test.js
git commit -m "Add pure progress-tracking logic with unit tests"
```

---

### Task 5: Express static server

**Files:**
- Create: `server.js`
- Create: `package.json`
- Test: `server.test.js`

**Interfaces:**
- Produces: an HTTP server listening on `process.env.PORT || 5000`, serving everything under `public/` as static files (so `GET /` serves `public/index.html`, `GET /words.js` serves `public/words.js`, etc.).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "kja-study",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
```

- [ ] **Step 2: Install express**

Run: `npm install`

- [ ] **Step 3: Write the failing test**

```javascript
// server.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { execSync } = require('node:child_process');

test('server serves index.html on GET / and words.js on GET /words.js', async () => {
  // ensure public/index.html exists for this test; created fully in Task 6
  const { spawn } = require('node:child_process');
  const child = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: '5099' },
    stdio: 'ignore',
  });

  await new Promise((resolve) => setTimeout(resolve, 300)); // let it boot

  try {
    const res = await new Promise((resolve, reject) => {
      http.get('http://localhost:5099/words.js', resolve).on('error', reject);
    });
    assert.strictEqual(res.statusCode, 200);
  } finally {
    child.kill();
  }
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test server.test.js`
Expected: FAIL (`server.js` does not exist yet)

- [ ] **Step 5: Write `server.js`**

```javascript
// server.js
const express = require('express');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`kja_study running at http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test server.test.js`
Expected: PASS (requires `public/words.js` to already exist from Task 3 — it does)

- [ ] **Step 7: Commit**

```bash
git add server.js package.json package-lock.json server.test.js
git commit -m "Add minimal Express static server on port 5000"
```

---

### Task 6: HTML shell and Toss-style baby-pink CSS

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

**Interfaces:**
- Produces: four screens in `index.html`, toggled by adding/removing a `hidden` attribute (no router library): `#screen-home`, `#screen-study`, `#screen-complete`, `#screen-review`. Task 7's `app.js` selects and shows/hides these by id.
- Card markup used by Task 7: `#card` (container with `.flippable` class toggled to flip), `#card-front-word`, `#card-front-pos`, `#card-back-meaning`.

- [ ] **Step 1: Write `public/index.html`**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>한국어 단어 카드</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="app">
    <section id="screen-home" class="screen">
      <h1>한국어 단어 카드</h1>
      <div id="level-list" class="level-list"></div>
    </section>

    <section id="screen-study" class="screen" hidden>
      <button class="back-btn" id="study-back-btn">← 홈</button>
      <div class="card-stage">
        <div id="card" class="card">
          <div class="card-face card-front">
            <p id="card-front-pos" class="card-pos"></p>
            <p id="card-front-word" class="card-word"></p>
          </div>
          <div class="card-face card-back">
            <p id="card-back-meaning" class="card-meaning"></p>
          </div>
        </div>
      </div>
      <div class="swipe-row">
        <button id="swipe-dont-know" class="swipe-btn dont-know">← 모름</button>
        <button id="swipe-know" class="swipe-btn know">안다 →</button>
      </div>
    </section>

    <section id="screen-complete" class="screen" hidden>
      <p id="complete-message" class="complete-message"></p>
      <div class="complete-actions">
        <button id="complete-review-btn" class="primary-btn" hidden>복습하기</button>
        <button id="complete-home-btn" class="primary-btn">홈으로</button>
      </div>
    </section>

    <section id="screen-review" class="screen" hidden>
      <button class="back-btn" id="review-back-btn">← 홈</button>
      <div class="card-stage">
        <div id="review-card" class="card">
          <div class="card-face card-front">
            <p id="review-card-front-pos" class="card-pos"></p>
            <p id="review-card-front-word" class="card-word"></p>
          </div>
          <div class="card-face card-back">
            <p id="review-card-back-meaning" class="card-meaning"></p>
          </div>
        </div>
      </div>
      <div class="swipe-row">
        <button id="review-swipe-dont-know" class="swipe-btn dont-know">← 모름</button>
        <button id="review-swipe-know" class="swipe-btn know">안다 →</button>
      </div>
    </section>
  </main>

  <script src="words.js"></script>
  <script src="progress.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/style.css`**

```css
:root {
  --pink: #ff8fab;
  --pink-light: #ffe3ec;
  --ink: #2b2b2b;
  --paper: #fffdfb;
  --shadow: 0 8px 24px rgba(255, 143, 171, 0.18);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.app {
  max-width: 480px;
  margin: 0 auto;
  padding: 32px 20px 60px;
  min-height: 100vh;
}

.screen[hidden] { display: none; }

h1 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 24px;
}

.level-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.level-card {
  background: white;
  border-radius: 24px;
  padding: 20px 24px;
  box-shadow: var(--shadow);
  border: none;
  text-align: left;
  cursor: pointer;
}

.level-card .level-title { font-size: 18px; font-weight: 700; }
.level-card .level-progress { font-size: 13px; color: #8a8a8a; margin-top: 6px; }

.review-btn {
  margin-top: 10px;
  display: inline-block;
  background: var(--pink-light);
  color: #c2185b;
  border: none;
  border-radius: 16px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.back-btn {
  background: none;
  border: none;
  color: #8a8a8a;
  font-size: 14px;
  padding: 8px 0;
  cursor: pointer;
}

.card-stage {
  display: flex;
  justify-content: center;
  margin: 40px 0;
  perspective: 1200px;
}

.card {
  width: 100%;
  max-width: 320px;
  height: 400px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.35s ease;
  cursor: pointer;
}

.card.flipped { transform: rotateY(180deg); }

.card-face {
  position: absolute;
  inset: 0;
  border-radius: 28px;
  background: white;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  backface-visibility: hidden;
  text-align: center;
}

.card-back { transform: rotateY(180deg); background: var(--pink-light); }

.card-pos { font-size: 13px; color: #c2185b; margin-bottom: 12px; }
.card-word { font-size: 30px; font-weight: 700; }
.card-meaning { font-size: 20px; font-weight: 600; line-height: 1.5; }

.swipe-row {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.swipe-btn {
  border: none;
  border-radius: 18px;
  padding: 14px 22px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.swipe-btn.dont-know { background: #f0f0f0; color: #666; }
.swipe-btn.know { background: var(--pink); color: white; }

.complete-message {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  margin: 60px 0 24px;
}

.complete-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.primary-btn {
  background: var(--pink);
  color: white;
  border: none;
  border-radius: 18px;
  padding: 14px 28px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
  max-width: 280px;
}
```

- [ ] **Step 3: Manual browser check**

Run: `npm start`, open `http://localhost:5000` in a browser. Expected: the home screen renders (empty level list is fine — Task 7 fills it in), no console errors about missing `style.css`.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "Add HTML shell and Toss-style baby-pink stylesheet"
```

---

### Task 7: Wire up `app.js` (levels, study, flip+swipe, complete, review)

**Files:**
- Create: `public/app.js`

**Interfaces:**
- Consumes: `WORDS` (global, from `words.js`, Task 3), `loadState`/`saveState`/`buildQueue`/`recordAnswer` (globals, from `progress.js`, Task 4), the DOM ids defined in Task 6.
- Level display names: A → "1단계", B → "2단계", C → "3단계".

- [ ] **Step 1: Write `public/app.js`**

```javascript
// public/app.js
(function () {
  const LEVELS = [
    { key: 'A', label: '1단계' },
    { key: 'B', label: '2단계' },
    { key: 'C', label: '3단계' },
  ];
  const DAILY_CAP = 30;
  const storage = window.localStorage;

  const wordsByLevel = { A: [], B: [], C: [] };
  WORDS.forEach((w) => wordsByLevel[w.level].push(w));

  let currentLevel = null;
  let queue = [];
  let queueIndex = 0;
  let reviewQueue = [];
  let reviewIndex = 0;

  function show(screenId) {
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = true; });
    document.getElementById(screenId).hidden = false;
  }

  function renderHome() {
    const list = document.getElementById('level-list');
    list.innerHTML = '';
    LEVELS.forEach(({ key, label }) => {
      const state = loadState(storage, key);
      const wrongCount = state.wrongIds.length;

      const btn = document.createElement('button');
      btn.className = 'level-card';
      btn.innerHTML = `
        <div class="level-title">${label}</div>
        <div class="level-progress">${state.todayCount}/${DAILY_CAP} 오늘 학습</div>
        ${wrongCount > 0 ? `<button class="review-btn" data-level="${key}">복습하기 (${wrongCount}개)</button>` : ''}
      `;
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('review-btn')) return; // handled below
        startStudy(key);
      });
      list.appendChild(btn);

      const reviewBtn = btn.querySelector('.review-btn');
      if (reviewBtn) {
        reviewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          startReview(key);
        });
      }
    });
    show('screen-home');
  }

  function startStudy(levelKey) {
    currentLevel = levelKey;
    const state = loadState(storage, levelKey);
    queue = buildQueue(wordsByLevel[levelKey], state, DAILY_CAP);
    queueIndex = 0;
    if (queue.length === 0) {
      showComplete(levelKey, allWordsSeen(levelKey, state)
        ? '이 단계의 모든 단어를 다 학습했어요! 🎉'
        : '오늘의 학습 한도(30개)를 다 채웠어요!');
      return;
    }
    show('screen-study');
    renderStudyCard();
  }

  function allWordsSeen(levelKey, state) {
    return state.seenIds.length >= wordsByLevel[levelKey].length;
  }

  function renderStudyCard() {
    const card = document.getElementById('card');
    card.classList.remove('flipped');
    const word = queue[queueIndex];
    document.getElementById('card-front-word').textContent = word.word;
    document.getElementById('card-front-pos').textContent = `(${word.pos})`;
    document.getElementById('card-back-meaning').textContent = word.meaning;
  }

  function answerCurrent(knows) {
    const word = queue[queueIndex];
    let state = loadState(storage, currentLevel);
    state = recordAnswer(state, word.id, knows);
    saveState(storage, currentLevel, state);

    queueIndex += 1;
    if (queueIndex >= queue.length) {
      const finalState = loadState(storage, currentLevel);
      showComplete(currentLevel, allWordsSeen(currentLevel, finalState)
        ? '이 단계의 모든 단어를 다 학습했어요! 🎉'
        : '오늘 학습을 마쳤어요!');
      return;
    }
    renderStudyCard();
  }

  function showComplete(levelKey, message) {
    currentLevel = levelKey;
    document.getElementById('complete-message').textContent = message;
    const state = loadState(storage, levelKey);
    const reviewBtn = document.getElementById('complete-review-btn');
    reviewBtn.hidden = state.wrongIds.length === 0;
    show('screen-complete');
  }

  function startReview(levelKey) {
    currentLevel = levelKey;
    const state = loadState(storage, levelKey);
    const wrongSet = new Set(state.wrongIds);
    reviewQueue = wordsByLevel[levelKey].filter((w) => wrongSet.has(w.id));
    reviewIndex = 0;
    if (reviewQueue.length === 0) {
      renderHome();
      return;
    }
    show('screen-review');
    renderReviewCard();
  }

  function renderReviewCard() {
    const card = document.getElementById('review-card');
    card.classList.remove('flipped');
    const word = reviewQueue[reviewIndex];
    document.getElementById('review-card-front-word').textContent = word.word;
    document.getElementById('review-card-front-pos').textContent = `(${word.pos})`;
    document.getElementById('review-card-back-meaning').textContent = word.meaning;
  }

  function answerReviewCurrent(knows) {
    const word = reviewQueue[reviewIndex];
    let state = loadState(storage, currentLevel);
    state = recordAnswer(state, word.id, knows);
    saveState(storage, currentLevel, state);

    reviewIndex += 1;
    if (reviewIndex >= reviewQueue.length) {
      document.getElementById('complete-message').textContent = '복습 완료!';
      document.getElementById('complete-review-btn').hidden = true;
      show('screen-complete');
      return;
    }
    renderReviewCard();
  }

  // --- wiring ---
  document.getElementById('card').addEventListener('click', () => {
    document.getElementById('card').classList.toggle('flipped');
  });
  document.getElementById('review-card').addEventListener('click', () => {
    document.getElementById('review-card').classList.toggle('flipped');
  });

  document.getElementById('swipe-know').addEventListener('click', () => answerCurrent(true));
  document.getElementById('swipe-dont-know').addEventListener('click', () => answerCurrent(false));
  document.getElementById('review-swipe-know').addEventListener('click', () => answerReviewCurrent(true));
  document.getElementById('review-swipe-dont-know').addEventListener('click', () => answerReviewCurrent(false));

  document.getElementById('study-back-btn').addEventListener('click', renderHome);
  document.getElementById('review-back-btn').addEventListener('click', renderHome);
  document.getElementById('complete-home-btn').addEventListener('click', renderHome);
  document.getElementById('complete-review-btn').addEventListener('click', () => startReview(currentLevel));

  // --- drag-to-swipe (pointer events cover mouse + touch) ---
  function enableDragSwipe(cardId, onKnow, onDontKnow) {
    const card = document.getElementById(cardId);
    let startX = null;

    card.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    card.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (!card.classList.contains('flipped')) return; // only swipe after seeing the back
      if (dx > 80) onKnow();
      else if (dx < -80) onDontKnow();
    });
  }
  enableDragSwipe('card', () => answerCurrent(true), () => answerCurrent(false));
  enableDragSwipe('review-card', () => answerReviewCurrent(true), () => answerReviewCurrent(false));

  renderHome();
})();
```

- [ ] **Step 2: Manual browser check**

Run: `npm start`, open `http://localhost:5000`.
Verify:
1. Home shows "1단계"/"2단계"/"3단계" with "0/30 오늘 학습" each, no 복습 buttons yet.
2. Click "1단계" → a card shows a Korean word + part of speech.
3. Click the card → it flips and shows the English meaning.
4. Click "모름" → next card appears; go back home → "1단계" now shows "1/30 오늘 학습" and a "복습하기 (1개)" button.
5. Click "복습하기" → the same word reappears; flip it and click "안다" → "복습 완료!" screen appears; go home → the 복습 button is gone.
6. On a touch device or with mouse drag emulation, dragging the flipped card left/right also triggers 모름/안다.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "Wire up level select, study, flip+swipe, complete and review screens"
```

---

### Task 8: Deployment prep (`.gitignore`, `README.md`, Render config)

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Write `.gitignore`**

```
node_modules/
```

- [ ] **Step 2: Write `README.md`**

```markdown
# 한국어 단어 카드

한국어 학습용 어휘 목록(A/B/C 3단계, 총 5,965단어)을 랜덤 순서 플래시카드로 학습하는 사이트.

## 로컬 실행

```bash
npm install
npm start
```

`http://localhost:5000` 에서 확인.

## 배포 (Render)

1. 이 저장소를 GitHub에 push
2. Render 대시보드 → New → Web Service → 이 GitHub 저장소 선택
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Render가 자동으로 `PORT` 환경변수를 주입하며, `server.js`가 이를 사용하도록 되어 있음
6. 무료 티어는 일정 시간 무활동 시 슬립되어 첫 요청 시 기동에 시간이 걸릴 수 있음
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore README.md
git commit -m "Add .gitignore and README with local + Render deploy instructions"
```

- [ ] **Step 4: Push to GitHub (requires user's own GitHub repo + explicit go-ahead)**

This step is **not** run automatically — confirm the target repo with the user first, since it pushes to a shared/remote system:

```bash
git remote add origin <user's GitHub repo URL>
git push -u origin master
```

---

## Self-Review Notes

- **Spec coverage:** home/level-select → study (flip+swipe, no 10-word interruption, 30/day/level cap) → complete → review, localStorage per level, Node/Express server on port 5000 with Render `PORT` support, Toss-style baby-pink CSS, data-prep pipeline generating English meanings — all covered by Tasks 1–8.
- **Placeholders:** none — every code step is fully written out except Task 2, whose deliverable is content (not logic) and carries a hard machine-checked acceptance test instead of code.
- **Type/name consistency checked:** `WORDS[i].id === i` (Task 3) is what `progress.js` (Task 4) and `app.js` (Task 7) both assume; `kja_progress_<LEVEL>` key format is used consistently in `progress.js` and nowhere else; `loadState/saveState/buildQueue/recordAnswer` signatures match between Task 4's implementation, its tests, and Task 7's usage.
