// public/progress.js
function todayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultState() {
  return { seenIds: [], wrongIds: [], today: todayString(), todayCount: 0, todayWords: [] };
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
  const todayWords = Array.isArray(parsed.todayWords) ? parsed.todayWords : [];

  const today = todayString();
  if (parsed.today !== today) {
    return { seenIds: parsed.seenIds, wrongIds: parsed.wrongIds, today, todayCount: 0, todayWords: [] };
  }
  return { ...parsed, todayWords };
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
