// public/app.js
(function () {
  const LEVELS = [
    { key: 'A', label: '1단계' },
    { key: 'B', label: '2단계' },
    { key: 'C', label: '3단계' },
  ];
  const DAILY_CAP = 30;
  const POS_LABELS = {
    명: 'Noun',
    동: 'Verb',
    형: 'Adjective',
    부: 'Adverb',
    의: 'Dependent Noun',
    관: 'Determiner',
    고: 'Proper Noun',
    대: 'Pronoun',
    수: 'Numeral',
    감: 'Interjection',
    보: 'Auxiliary',
    불: 'Other',
  };
  function posLabel(pos) {
    return POS_LABELS[pos] || pos;
  }
  const storage = (() => {
    try {
      window.localStorage.setItem('__kja_probe', '1');
      window.localStorage.removeItem('__kja_probe');
      return window.localStorage;
    } catch {
      const mem = {};
      return {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
      };
    }
  })();

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

  function pad4(n) {
    return String(n).padStart(4, '0');
  }

  function renderHomeDate() {
    const [y, m, d] = todayString().split('-');
    document.getElementById('home-date').textContent = `${y}년 ${Number(m)}월 ${Number(d)}일`;
  }

  function renderHome() {
    renderHomeDate();
    const list = document.getElementById('level-list');
    list.innerHTML = '';
    LEVELS.forEach(({ key, label }) => {
      const state = loadState(storage, key);
      const wrongCount = state.wrongIds.length;
      const total = wordsByLevel[key].length;

      const btn = document.createElement('button');
      btn.className = 'level-card';
      btn.innerHTML = `
        <div class="level-title">${label}</div>
        <div class="level-progress">${state.todayCount}/${DAILY_CAP} 오늘 학습</div>
        <div class="level-total">${pad4(state.seenIds.length)}/${pad4(total)}</div>
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
    document.getElementById('card-front-pos').textContent = `(${posLabel(word.pos)})`;
    document.getElementById('card-front-emoji').textContent = word.emoji;
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
    document.getElementById('review-card-front-pos').textContent = `(${posLabel(word.pos)})`;
    document.getElementById('review-card-front-emoji').textContent = word.emoji;
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
      const finalState = loadState(storage, currentLevel);
      document.getElementById('complete-review-btn').hidden = finalState.wrongIds.length === 0;
      show('screen-complete');
      return;
    }
    renderReviewCard();
  }

  // --- wiring ---
  document.getElementById('swipe-know').addEventListener('click', () => answerCurrent(true));
  document.getElementById('swipe-dont-know').addEventListener('click', () => answerCurrent(false));
  document.getElementById('review-swipe-know').addEventListener('click', () => answerReviewCurrent(true));
  document.getElementById('review-swipe-dont-know').addEventListener('click', () => answerReviewCurrent(false));

  document.getElementById('study-back-btn').addEventListener('click', renderHome);
  document.getElementById('review-back-btn').addEventListener('click', renderHome);
  document.getElementById('complete-home-btn').addEventListener('click', renderHome);
  document.getElementById('complete-review-btn').addEventListener('click', () => startReview(currentLevel));

  // --- tap-to-flip + drag-to-swipe, unified (pointer events cover mouse + touch) ---
  function enableSwipeCard(cardId, onKnow, onDontKnow) {
    const card = document.getElementById(cardId);
    let startX = null;

    card.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      card.setPointerCapture(e.pointerId);
    });

    card.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;

      if (Math.abs(dx) <= 80) {
        card.classList.toggle('flipped'); // treat as a tap: flip the card
        return;
      }
      if (!card.classList.contains('flipped')) return; // only swipe-answer after seeing the back
      if (dx > 0) onKnow();
      else onDontKnow();
    });
  }
  enableSwipeCard('card', () => answerCurrent(true), () => answerCurrent(false));
  enableSwipeCard('review-card', () => answerReviewCurrent(true), () => answerReviewCurrent(false));

  renderHome();
})();
