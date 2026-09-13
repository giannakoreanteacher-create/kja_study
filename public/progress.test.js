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
