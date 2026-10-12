// Study: focus timer, session log, revision tasks, spaced-repetition flashcards.
(function () {
  const S = () => Store.state;
  const $ = (sel) => document.querySelector(sel);

  // ---------- Focus timer ----------
  const timer = { mode: 'focus', running: false, endsAt: 0, remaining: 25 * 60, tick: null, cycles: 0 };
  const lengths = () => ({
    focus: Util.num($('#timer-focus').value, 25) * 60,
    short: Util.num($('#timer-short').value, 5) * 60,
    long: Util.num($('#timer-long').value, 15) * 60,
  });

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  function drawTimer() {
    const total = lengths()[timer.mode];
    const rem = timer.running ? (timer.endsAt - Date.now()) / 1000 : timer.remaining;
    $('#timer-display').textContent = fmt(rem);
    const pct = total ? 1 - Math.max(0, rem) / total : 0;
    $('#timer-ring').style.strokeDashoffset = String(565.48 * (1 - pct));
    $('#timer-start').textContent = timer.running ? 'Pause' : rem < total ? 'Resume' : 'Start';
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === timer.mode));
    $('#timer-mode-label').textContent = timer.mode === 'focus' ? 'Focus' : timer.mode === 'short' ? 'Short break' : 'Long break';
    if (timer.running) document.title = `${fmt(rem)} · ${timer.mode === 'focus' ? 'Focus' : 'Break'} — Locked In`;
    if (timer.running && rem <= 0) complete();
  }

  function setMode(mode) {
    pause();
    timer.mode = mode;
    timer.remaining = lengths()[mode];
    drawTimer();
  }

  function start() {
    timer.running = true;
    timer.endsAt = Date.now() + timer.remaining * 1000;
    timer.tick = setInterval(drawTimer, 250);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    drawTimer();
  }

  function pause() {
    if (timer.running) timer.remaining = Math.max(0, (timer.endsAt - Date.now()) / 1000);
    timer.running = false;
    clearInterval(timer.tick);
    document.title = 'Locked In';
    drawTimer();
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.2, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.2);
      });
    } catch (e) {
      /* audio not available */
    }
  }

  function notify(msg) {
    beep();
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Locked In', { body: msg });
    App.toast(msg);
  }

  function complete() {
    const wasFocus = timer.mode === 'focus';
    timer.running = false;
    clearInterval(timer.tick);
    document.title = 'Locked In';
    if (wasFocus) {
      logSession($('#timer-subject').value, lengths().focus / 60, 'Focus session');
      timer.cycles++;
      notify('Focus session done — take a break!');
      setMode(timer.cycles % 4 === 0 ? 'long' : 'short');
    } else {
      notify('Break over — back to it.');
      setMode('focus');
    }
  }

  function logSession(subject, minutes, note = '') {
    if (!minutes) return;
    S().studySessions.push({ id: Util.uid(), date: Util.today(), subject: subject || 'General', minutes: Util.round(minutes, 1), note });
    Store.save();
  }

  // ---------- Flashcards (simplified SM-2) ----------
  let review = null; // {deckId, queue:[cardId], showing:false}

  function dueCards(deck) {
    const today = Util.today();
    return deck.cards.filter((c) => !c.due || c.due <= today);
  }

  function allDueCount() {
    return S().decks.reduce((n, d) => n + dueCards(d).length, 0);
  }

  function schedule(card, grade) {
    // grade: 0 again, 1 hard, 2 good, 3 easy
    card.ease = card.ease || 2.5;
    card.interval = card.interval || 0;
    card.reps = card.reps || 0;
    if (grade === 0) {
      card.reps = 0;
      card.interval = 0;
      card.ease = Math.max(1.3, card.ease - 0.2);
    } else {
      if (grade === 1) {
        card.interval = Math.max(1, Math.round(card.interval * 1.2));
        card.ease = Math.max(1.3, card.ease - 0.15);
      } else if (card.reps === 0) {
        card.interval = grade === 3 ? 4 : 1;
      } else if (card.reps === 1) {
        card.interval = grade === 3 ? 6 : 3;
      } else {
        card.interval = Math.round(card.interval * card.ease * (grade === 3 ? 1.3 : 1));
      }
      if (grade === 3) card.ease += 0.15;
      card.reps++;
    }
    card.due = Util.addDays(Util.today(), card.interval);
  }

  function renderDecks() {
    const decks = S().decks;
    $('#deck-list').innerHTML = decks.length
      ? decks
          .map((d) => {
            const due = dueCards(d).length;
            return `<div class="deck">
          <div><b>${Util.esc(d.name)}</b><div class="muted small">${d.cards.length} cards · ${due} due</div></div>
          <div class="row gap">
            <button class="btn small" data-review="${d.id}" ${due ? '' : 'disabled'}>Review</button>
            <button class="btn small ghost" data-add-cards="${d.id}">Add cards</button>
            <button class="icon-btn danger" data-del-deck="${d.id}" title="Delete deck">✕</button>
          </div></div>`;
          })
          .join('')
      : '<p class="muted">Create a deck for each topic, then add question/answer cards. Cards you find hard come back sooner.</p>';
    $('#card-deck').innerHTML = decks.map((d) => `<option value="${d.id}">${Util.esc(d.name)}</option>`).join('');
    $('#card-form').hidden = !decks.length;
  }

  function renderReview() {
    const box = $('#review');
    if (!review) {
      box.hidden = true;
      return;
    }
    const deck = S().decks.find((d) => d.id === review.deckId);
    const card = deck && deck.cards.find((c) => c.id === review.queue[0]);
    box.hidden = false;
    if (!card) {
      box.innerHTML = `<div class="review-done"><h3>Deck complete 🎉</h3><p class="muted">Nothing else due in ${Util.esc(deck ? deck.name : 'this deck')}.</p>
        <button class="btn" id="review-close">Done</button></div>`;
      $('#review-close').onclick = () => {
        review = null;
        renderReview();
      };
      return;
    }
    box.innerHTML = `<div class="review-head"><span class="muted">${Util.esc(deck.name)} · ${review.queue.length} left</span>
        <button class="icon-btn" id="review-exit" title="Stop reviewing">✕</button></div>
      <div class="flashcard ${review.showing ? 'flipped' : ''}" id="flashcard">
        <div class="fc-front">${Util.esc(card.front).replace(/\n/g, '<br>')}</div>
        ${review.showing ? `<hr><div class="fc-back">${Util.esc(card.back).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
      ${
        review.showing
          ? `<div class="grade-row">
          <button class="btn grade again" data-grade="0">Again<small>now</small></button>
          <button class="btn grade hard" data-grade="1">Hard</button>
          <button class="btn grade good" data-grade="2">Good</button>
          <button class="btn grade easy" data-grade="3">Easy</button></div>`
          : `<button class="btn primary wide" id="reveal">Show answer <span class="muted small">(space)</span></button>`
      }`;
    $('#review-exit').onclick = () => {
      review = null;
      renderReview();
    };
    if (!review.showing) $('#reveal').onclick = reveal;
    box.querySelectorAll('[data-grade]').forEach((b) => (b.onclick = () => grade(Number(b.dataset.grade))));
  }

  function reveal() {
    review.showing = true;
    renderReview();
  }

  function grade(g) {
    const deck = S().decks.find((d) => d.id === review.deckId);
    const card = deck.cards.find((c) => c.id === review.queue[0]);
    schedule(card, g);
    review.queue.shift();
    if (g === 0) review.queue.push(card.id); // see it again this session
    review.showing = false;
    review.reviewed = (review.reviewed || 0) + 1;
    Store.save();
  }

  // ---------- Tasks ----------
  function renderTasks() {
    const tasks = [...S().tasks].sort((a, b) => a.done - b.done || (a.due || '9999').localeCompare(b.due || '9999'));
    const today = Util.today();
    $('#task-list').innerHTML = tasks.length
      ? tasks
          .map(
            (t) => `<li class="task ${t.done ? 'done' : ''}">
          <label><input type="checkbox" data-toggle-task="${t.id}" ${t.done ? 'checked' : ''}>
          <span>${Util.esc(t.text)}</span></label>
          <span class="row gap">
            ${t.subject ? `<span class="tag">${Util.esc(t.subject)}</span>` : ''}
            ${t.due ? `<span class="small ${!t.done && t.due < today ? 'overdue' : 'muted'}">${t.due === today ? 'Today' : Util.fmtDate(t.due, { day: 'numeric', month: 'short' })}</span>` : ''}
            <button class="icon-btn" data-del-task="${t.id}" title="Delete">✕</button>
          </span></li>`
          )
          .join('')
      : '<li class="muted">No revision tasks yet. Add homework, exam topics or past papers to work through.</li>';
  }

  // ---------- Stats ----------
  function renderStats() {
    const sessions = S().studySessions;
    const data = Util.lastNDays(14).map((d) => ({
      label: Util.fmtDate(d, { day: 'numeric', month: 'short' }),
      value: sessions.filter((s) => s.date === d).reduce((t, s) => t + s.minutes, 0),
    }));
    Charts.bar($('#study-chart'), data, {
      goal: S().goals.studyMinutes,
      goalLabel: `Goal ${Util.fmtMinutes(S().goals.studyMinutes)}`,
      yFmt: (v) => `${Math.round(v)}m`,
      tipFmt: (p) => `<b>${Util.fmtMinutes(p.value)}</b><span>${Util.esc(p.label)}</span>`,
      ariaLabel: 'Study minutes over the last 14 days',
    });

    const weekStart = Util.startOfWeek();
    const bySubject = {};
    sessions.filter((s) => s.date >= weekStart).forEach((s) => (bySubject[s.subject] = (bySubject[s.subject] || 0) + s.minutes));
    const rows = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 0;
    $('#subject-breakdown').innerHTML = rows.length
      ? rows
          .map(
            ([sub, m]) => `<div class="hbar"><span>${Util.esc(sub)}</span>
          <div class="meter"><div style="width:${(m / max) * 100}%"></div></div><span class="muted">${Util.fmtMinutes(m)}</span></div>`
          )
          .join('')
      : '<p class="muted small">No study logged this week yet.</p>';

    $('#session-log').innerHTML =
      [...sessions]
        .reverse()
        .slice(0, 8)
        .map(
          (s) => `<li><span><b>${Util.esc(s.subject)}</b> <span class="muted">· ${Util.fmtMinutes(s.minutes)}${s.note ? ` · ${Util.esc(s.note)}` : ''}</span></span>
        <span class="row gap"><span class="muted small">${Util.fmtDate(s.date, { day: 'numeric', month: 'short' })}</span>
        <button class="icon-btn" data-del-session="${s.id}" title="Delete">✕</button></span></li>`
        )
        .join('') || '<li class="muted small">Sessions from the timer and manual logs appear here.</li>';
  }

  function renderSubjects() {
    const opts = S().subjects.map((s) => `<option>${Util.esc(s)}</option>`).join('');
    ['#timer-subject', '#manual-subject'].forEach((id) => {
      const el = $(id);
      const v = el.value;
      el.innerHTML = opts;
      if (S().subjects.includes(v)) el.value = v;
    });
    const tv = $('#task-subject').value;
    $('#task-subject').innerHTML = '<option value="">No subject</option>' + opts;
    $('#task-subject').value = S().subjects.includes(tv) ? tv : '';
    $('#subject-chips').innerHTML = S()
      .subjects.map((s, i) => `<span class="chip">${Util.esc(s)}<span class="chip-x" data-del-subject="${i}" title="Remove">✕</span></span>`)
      .join('');
  }

  function render() {
    renderSubjects();
    renderStats();
    renderTasks();
    renderDecks();
    renderReview();
    if (!timer.running) drawTimer();
  }

  function init() {
    timer.remaining = lengths().focus;
    $('#timer-start').onclick = () => (timer.running ? pause() : start());
    $('#timer-reset').onclick = () => setMode(timer.mode);
    $('#timer-skip').onclick = () => {
      pause();
      // Log the partial focus time if at least a minute was done
      if (timer.mode === 'focus') {
        const done = (lengths().focus - timer.remaining) / 60;
        if (done >= 1) logSession($('#timer-subject').value, done, 'Partial focus');
      }
      setMode(timer.mode === 'focus' ? 'short' : 'focus');
    };
    document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    ['#timer-focus', '#timer-short', '#timer-long'].forEach((id) =>
      $(id).addEventListener('change', () => {
        if (!timer.running) setMode(timer.mode);
      })
    );

    $('#manual-form').onsubmit = (e) => {
      e.preventDefault();
      logSession($('#manual-subject').value, Util.num($('#manual-minutes').value), $('#manual-note').value.trim());
      $('#manual-form').reset();
      renderSubjects();
      App.toast('Study session logged');
    };
    $('#session-log').onclick = (e) => {
      const del = e.target.closest('[data-del-session]');
      if (del) {
        S().studySessions = S().studySessions.filter((s) => s.id !== del.dataset.delSession);
        Store.save();
      }
    };
    $('#subject-form').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#subject-name').value.trim();
      if (name && !S().subjects.includes(name)) S().subjects.push(name);
      $('#subject-name').value = '';
      Store.save();
    };
    $('#subject-chips').onclick = (e) => {
      const del = e.target.closest('[data-del-subject]');
      if (del) {
        S().subjects.splice(Number(del.dataset.delSubject), 1);
        Store.save();
      }
    };

    $('#task-form').onsubmit = (e) => {
      e.preventDefault();
      const text = $('#task-text').value.trim();
      if (!text) return;
      S().tasks.push({ id: Util.uid(), text, subject: $('#task-subject').value, due: $('#task-due').value, done: false });
      $('#task-text').value = '';
      Store.save();
    };
    $('#task-list').onclick = (e) => {
      const tog = e.target.closest('[data-toggle-task]');
      const del = e.target.closest('[data-del-task]');
      if (tog) {
        const t = S().tasks.find((x) => x.id === tog.dataset.toggleTask);
        t.done = tog.checked;
        Store.save();
      }
      if (del) {
        S().tasks = S().tasks.filter((x) => x.id !== del.dataset.delTask);
        Store.save();
      }
    };

    $('#deck-form').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#deck-name').value.trim();
      if (!name) return;
      const deck = { id: Util.uid(), name, cards: [] };
      S().decks.push(deck);
      $('#deck-name').value = '';
      Store.save();
      $('#card-deck').value = deck.id;
      $('#card-front').focus();
    };
    $('#deck-list').onclick = (e) => {
      const rev = e.target.closest('[data-review]');
      const add = e.target.closest('[data-add-cards]');
      const del = e.target.closest('[data-del-deck]');
      if (rev) {
        const deck = S().decks.find((d) => d.id === rev.dataset.review);
        review = { deckId: deck.id, queue: dueCards(deck).map((c) => c.id), showing: false };
        renderReview();
        $('#review').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (add) {
        $('#card-deck').value = add.dataset.addCards;
        $('#card-front').focus();
      }
      if (del && confirm('Delete this deck and all its cards?')) {
        S().decks = S().decks.filter((d) => d.id !== del.dataset.delDeck);
        if (review && review.deckId === del.dataset.delDeck) review = null;
        Store.save();
      }
    };
    $('#card-form').onsubmit = (e) => {
      e.preventDefault();
      const deck = S().decks.find((d) => d.id === $('#card-deck').value);
      const front = $('#card-front').value.trim();
      const back = $('#card-back').value.trim();
      if (!deck || !front || !back) return;
      deck.cards.push({ id: Util.uid(), front, back, due: Util.today(), interval: 0, ease: 2.5, reps: 0 });
      $('#card-front').value = '';
      $('#card-back').value = '';
      $('#card-front').focus();
      Store.save();
      App.toast(`Card added to ${deck.name}`);
    };
    $('#bulk-cards').onclick = () => {
      const deck = S().decks.find((d) => d.id === $('#card-deck').value);
      if (!deck) return;
      const text = prompt('Paste one card per line as:  question | answer');
      if (!text) return;
      let n = 0;
      text.split('\n').forEach((line) => {
        const [front, ...rest] = line.split('|');
        const back = rest.join('|').trim();
        if (front && front.trim() && back) {
          deck.cards.push({ id: Util.uid(), front: front.trim(), back, due: Util.today(), interval: 0, ease: 2.5, reps: 0 });
          n++;
        }
      });
      Store.save();
      App.toast(`Imported ${n} cards`);
    };

    document.addEventListener('keydown', (e) => {
      if (!review || $('#review').hidden || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.code === 'Space' && !review.showing) {
        e.preventDefault();
        reveal();
      } else if (review.showing && ['1', '2', '3', '4'].includes(e.key)) {
        grade(Number(e.key) - 1);
      }
    });
  }

  window.Study = { init, render, allDueCount, timer };
})();
