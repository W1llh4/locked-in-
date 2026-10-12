// App shell: routing, dashboard, settings, toasts, theme.
(function () {
  const S = () => Store.state;
  const $ = (sel) => document.querySelector(sel);
  const VIEWS = ['dashboard', 'gym', 'nutrition', 'study', 'settings'];

  function currentView() {
    const v = location.hash.replace('#', '');
    return VIEWS.includes(v) ? v : 'dashboard';
  }

  function show(view) {
    document.querySelectorAll('.view').forEach((el) => (el.hidden = el.id !== `view-${view}`));
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${view}`));
    render();
  }

  function render() {
    const view = currentView();
    if (view === 'dashboard') renderDashboard();
    if (view === 'gym') Gym.render();
    if (view === 'nutrition') Nutrition.render();
    if (view === 'study') Study.render();
    if (view === 'settings') renderSettings();
    const due = Study.allDueCount();
    $('#nav-due').textContent = due || '';
    $('#nav-due').hidden = !due;
  }

  // ---------- Dashboard ----------
  function activeOn(date) {
    return {
      gym: S().workouts.some((w) => w.date === date),
      food: S().foods.some((f) => f.date === date),
      study: S().studySessions.some((s) => s.date === date),
    };
  }

  function streak() {
    let n = 0;
    let d = Util.today();
    const any = (k) => Object.values(activeOn(k)).some(Boolean);
    if (!any(d)) d = Util.addDays(d, -1); // today not done yet doesn't break the streak
    while (any(d)) {
      n++;
      d = Util.addDays(d, -1);
    }
    return n;
  }

  function tile(label, value, sub, pct, href) {
    return `<a class="tile" href="${href}">
      <div class="tile-label">${label}</div>
      <div class="tile-value">${value}</div>
      ${pct != null ? `<div class="meter ${pct > 100 ? 'over' : ''}"><div style="width:${Math.min(100, pct)}%"></div></div>` : ''}
      <div class="tile-sub muted">${sub}</div></a>`;
  }

  function renderDashboard() {
    const g = S().goals;
    const today = Util.today();
    const hour = new Date().getHours();
    $('#greeting').textContent = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    $('#today-date').textContent = Util.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' });

    const t = Nutrition.totals(today);
    const studyToday = S().studySessions.filter((s) => s.date === today).reduce((a, s) => a + s.minutes, 0);
    const weekStart = Util.startOfWeek();
    const weekWorkouts = S().workouts.filter((w) => w.date >= weekStart && w.date <= today);
    const due = Study.allDueCount();
    const water = S().water[today] || 0;
    const openTasks = S().tasks.filter((x) => !x.done && x.due && x.due <= today);

    $('#tiles').innerHTML = [
      tile('Calories', Math.round(t.calories).toLocaleString(), `of ${g.calories.toLocaleString()} kcal`, (t.calories / g.calories) * 100, '#nutrition'),
      tile('Protein', `${Math.round(t.protein)}g`, `of ${g.protein}g`, (t.protein / g.protein) * 100, '#nutrition'),
      tile('Water', `${(water / 1000).toFixed(1)}L`, `of ${(g.water / 1000).toFixed(1)}L`, (water / g.water) * 100, '#nutrition'),
      tile('Study today', Util.fmtMinutes(studyToday), `of ${Util.fmtMinutes(g.studyMinutes)}`, (studyToday / g.studyMinutes) * 100, '#study'),
      tile('Workouts this week', weekWorkouts.length, `of ${g.workoutsPerWeek} planned`, (weekWorkouts.length / g.workoutsPerWeek) * 100, '#gym'),
      tile('Flashcards due', due, due ? 'Review now' : 'All caught up', null, '#study'),
    ].join('');

    const s = streak();
    $('#streak').innerHTML = `<span class="streak-num">${s}</span><span>day streak${s ? ' 🔥' : ''}</span>`;

    $('#week-grid').innerHTML = Util.lastNDays(7)
      .map((d) => {
        const a = activeOn(d);
        return `<div class="day ${d === today ? 'is-today' : ''}">
          <div class="muted small">${Util.fmtDate(d, { weekday: 'short' })}</div>
          <div class="dots">
            <span class="dot ${a.gym ? 'on' : ''}" title="Workout">🏋️</span>
            <span class="dot ${a.food ? 'on' : ''}" title="Food logged">🥗</span>
            <span class="dot ${a.study ? 'on' : ''}" title="Studied">📚</span>
          </div></div>`;
      })
      .join('');

    $('#dash-tasks').innerHTML = openTasks.length
      ? openTasks
          .slice(0, 6)
          .map(
            (x) => `<li><label><input type="checkbox" data-dash-task="${x.id}"> ${Util.esc(x.text)}</label>
            <span class="small ${x.due < today ? 'overdue' : 'muted'}">${x.due < today ? 'Overdue' : 'Today'}</span></li>`
          )
          .join('')
      : '<li class="muted">Nothing due today. Add revision tasks in Study.</li>';

    const last = S().workouts[S().workouts.length - 1];
    $('#dash-last-workout').innerHTML = last
      ? `<b>${Util.esc(last.name)}</b> <span class="muted">· ${Util.fmtDate(last.date)}</span>
         <div class="muted small">${last.exercises.map((e) => Util.esc(e.name)).join(', ')}</div>`
      : '<span class="muted">No workouts yet — log your first one in Gym.</span>';
  }

  // ---------- Settings ----------
  function renderSettings() {
    $('#set-unit').value = S().unit;
    $('#set-study-goal').value = S().goals.studyMinutes;
    $('#set-workout-goal').value = S().goals.workoutsPerWeek;
    const counts = `${S().workouts.length} workouts · ${S().foods.length} food entries · ${S().studySessions.length} study sessions · ${S().decks.reduce((n, d) => n + d.cards.length, 0)} flashcards`;
    $('#data-counts').textContent = counts;
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(S(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `locked-in-backup-${Util.today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (typeof data !== 'object' || !data) throw new Error('bad file');
        if (!confirm('Replace all current data with this backup?')) return;
        Store.replace(data);
        toast('Backup restored');
      } catch (e) {
        toast('That file is not a valid backup');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Toast & theme ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function applyTheme(theme) {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }

  function init() {
    let theme = null;
    try {
      theme = localStorage.getItem('locked-in:theme');
    } catch (e) {
      /* storage blocked */
    }
    applyTheme(theme);
    const toggleTheme = () => {
      const dark = document.documentElement.dataset.theme
        ? document.documentElement.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      const next = dark ? 'light' : 'dark';
      applyTheme(next);
      try {
        localStorage.setItem('locked-in:theme', next);
      } catch (e) {
        /* storage blocked */
      }
    };

    $('#theme-toggle').onclick = toggleTheme;
    $('#theme-toggle-2').onclick = toggleTheme;

    Gym.init();
    Nutrition.init();
    Study.init();

    $('#dash-tasks').onclick = (e) => {
      const cb = e.target.closest('[data-dash-task]');
      if (cb) {
        S().tasks.find((x) => x.id === cb.dataset.dashTask).done = true;
        Store.save();
        toast('Nice — task done ✅');
      }
    };
    $('#settings-form').onsubmit = (e) => {
      e.preventDefault();
      S().unit = $('#set-unit').value;
      S().goals.studyMinutes = Util.num($('#set-study-goal').value, 120);
      S().goals.workoutsPerWeek = Util.num($('#set-workout-goal').value, 4);
      Store.save();
      toast('Settings saved');
    };
    $('#export-btn').onclick = exportData;
    $('#import-file').onchange = (e) => e.target.files[0] && importData(e.target.files[0]);
    $('#reset-btn').onclick = () => {
      if (confirm('This deletes ALL your data on this device. Export a backup first if you want to keep it. Continue?')) {
        Store.reset();
        toast('All data cleared');
      }
    };

    Store.onChange(render);
    window.addEventListener('hashchange', () => show(currentView()));
    // Roll the dashboard over at midnight / when returning to the tab
    document.addEventListener('visibilitychange', () => !document.hidden && render());
    let resizeTimer;
    let lastWidth = innerWidth;
    window.addEventListener('resize', () => {
      if (innerWidth === lastWidth) return; // ignore mobile URL-bar height changes
      lastWidth = innerWidth;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 150);
    });
    show(currentView());
  }

  window.App = { toast };
  document.addEventListener('DOMContentLoaded', init);
})();
