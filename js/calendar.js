// Calendar: year / month / week / day views of activity, plus your own events.
(function () {
  const S = () => Store.state;
  const $ = (sel) => document.querySelector(sel);
  const CATEGORIES = ['Exam', 'Study', 'Gym', 'Social', 'Other'];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cal = { view: 'month', date: Util.today() };

  // ---------- Data ----------
  function eventsOn(date) {
    const weekday = Util.parseDate(date).getDay();
    return S()
      .events.filter((e) =>
        e.repeat === 'weekly' ? e.date <= date && Util.parseDate(e.date).getDay() === weekday : e.date === date
      )
      .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  }

  // Everything that happened on a day, built once per render for speed.
  function buildIndex() {
    const idx = {};
    const get = (d) => (idx[d] = idx[d] || { workouts: [], kcal: 0, protein: 0, foods: 0, study: 0, sessions: [], tasks: [] });
    S().workouts.forEach((w) => get(w.date).workouts.push(w));
    S().foods.forEach((f) => {
      const d = get(f.date);
      d.kcal += f.calories;
      d.protein += f.protein;
      d.foods++;
    });
    S().studySessions.forEach((s) => {
      const d = get(s.date);
      d.study += s.minutes;
      d.sessions.push(s);
    });
    S().tasks.forEach((t) => t.due && get(t.due).tasks.push(t));
    const empty = { workouts: [], kcal: 0, protein: 0, foods: 0, study: 0, sessions: [], tasks: [] };
    return (d) => idx[d] || empty;
  }

  // 0–3: how many of gym / food / study were done that day
  const level = (info) => (info.workouts.length ? 1 : 0) + (info.foods ? 1 : 0) + (info.study ? 1 : 0);

  const catClass = (c) => `cat-${Math.max(0, CATEGORIES.indexOf(c)) + 1}`;
  const fmtTime = (t) => (t ? t : '');

  function monthDays(year, month) {
    // Monday-first grid: leading blanks count + days in month
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return { lead, days };
  }

  // ---------- Header / navigation ----------
  function title() {
    const d = Util.parseDate(cal.date);
    if (cal.view === 'year') return String(d.getFullYear());
    if (cal.view === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (cal.view === 'week') {
      const start = Util.startOfWeek(cal.date);
      const end = Util.addDays(start, 6);
      const s = Util.parseDate(start);
      const e = Util.parseDate(end);
      return `${s.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function shift(dir) {
    const d = Util.parseDate(cal.date);
    if (cal.view === 'year') d.setFullYear(d.getFullYear() + dir, d.getMonth(), 1);
    else if (cal.view === 'month') d.setMonth(d.getMonth() + dir, 1);
    else if (cal.view === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    cal.date = Util.dateKey(d);
    render();
  }

  function go(view, date) {
    cal.view = view;
    if (date) cal.date = date;
    render();
    $('#view-calendar').scrollIntoView({ block: 'start' });
  }

  // ---------- Year ----------
  function renderYear(info) {
    const year = Util.parseDate(cal.date).getFullYear();
    const today = Util.today();
    let workouts = 0;
    let study = 0;
    let foodDays = 0;
    let activeDays = 0;
    const months = [];
    for (let m = 0; m < 12; m++) {
      const { lead, days } = monthDays(year, m);
      let cells = '<span class="yc blank"></span>'.repeat(lead);
      for (let day = 1; day <= days; day++) {
        const key = Util.dateKey(new Date(year, m, day));
        const i = info(key);
        const lvl = level(i);
        const ev = eventsOn(key);
        workouts += i.workouts.length;
        study += i.study;
        if (i.foods) foodDays++;
        if (lvl) activeDays++;
        const tip = [
          Util.fmtDate(key),
          i.workouts.length && `🏋️ ${i.workouts.map((w) => w.name).join(', ')}`,
          i.foods && `🥗 ${Math.round(i.kcal)} kcal`,
          i.study && `📚 ${Util.fmtMinutes(i.study)}`,
          ...ev.map((e) => `📌 ${e.title}`),
        ]
          .filter(Boolean)
          .join('\n');
        cells += `<button class="yc lvl-${lvl} ${key === today ? 'is-today' : ''} ${ev.length ? 'has-event' : ''}" data-day="${key}" title="${Util.esc(tip)}">${day}</button>`;
      }
      const name = new Date(year, m, 1).toLocaleDateString(undefined, { month: 'long' });
      months.push(`<div class="year-month">
        <button class="ym-name" data-month="${Util.dateKey(new Date(year, m, 1))}">${name}</button>
        <div class="ym-grid">${WEEKDAYS.map((w) => `<span class="yc head">${w[0]}</span>`).join('')}${cells}</div>
      </div>`);
    }
    return `<div class="year-stats">
        <div><b>${activeDays}</b><span class="muted small">active days</span></div>
        <div><b>${workouts}</b><span class="muted small">workouts</span></div>
        <div><b>${Util.round(study / 60, 1)}h</b><span class="muted small">studied</span></div>
        <div><b>${foodDays}</b><span class="muted small">days food logged</span></div>
      </div>
      <div class="year-grid">${months.join('')}</div>
      <div class="heat-legend muted small">
        <span>Less</span>${[0, 1, 2, 3].map((l) => `<span class="yc lvl-${l}"></span>`).join('')}<span>More</span>
        <span class="legend-sep"></span><span class="yc has-event"></span><span>Has an event</span>
        <span class="legend-sep"></span><span>Shade = how many of gym, food and study you did</span>
      </div>`;
  }

  // ---------- Month ----------
  function activityIcons(i) {
    return `${i.workouts.length ? '<span title="Workout">🏋️</span>' : ''}${i.foods ? `<span title="${Math.round(i.kcal)} kcal">🥗</span>` : ''}${
      i.study ? `<span title="${Util.fmtMinutes(i.study)} studied">📚</span>` : ''
    }`;
  }

  function renderMonth(info) {
    const d = Util.parseDate(cal.date);
    const year = d.getFullYear();
    const month = d.getMonth();
    const { lead, days } = monthDays(year, month);
    const today = Util.today();
    const start = Util.addDays(Util.dateKey(new Date(year, month, 1)), -lead);
    const weeks = Math.ceil((lead + days) / 7);
    let cells = '';
    for (let n = 0; n < weeks * 7; n++) {
      const key = Util.addDays(start, n);
      const kd = Util.parseDate(key);
      const i = info(key);
      const ev = eventsOn(key);
      const openTasks = i.tasks.filter((t) => !t.done);
      const items = ev
        .slice(0, 3)
        .map((e) => `<div class="m-event ${catClass(e.category)}">${e.time ? `<span class="m-time">${e.time}</span>` : ''}${Util.esc(e.title)}</div>`)
        .join('');
      cells += `<button class="m-cell ${kd.getMonth() !== month ? 'other' : ''} ${key === today ? 'is-today' : ''}" data-day="${key}">
        <div class="m-top"><span class="m-num">${kd.getDate()}</span><span class="m-icons">${activityIcons(i)}</span></div>
        ${items}${ev.length > 3 ? `<div class="muted small">+${ev.length - 3} more</div>` : ''}
        ${openTasks.length ? `<div class="m-task small">✅ ${openTasks.length} task${openTasks.length > 1 ? 's' : ''}</div>` : ''}
      </button>`;
    }
    return `<div class="month-grid">${WEEKDAYS.map((w) => `<div class="m-head">${w}</div>`).join('')}${cells}</div>`;
  }

  // ---------- Week ----------
  function dayItems(key, info) {
    const i = info(key);
    const ev = eventsOn(key);
    const out = ev.map(
      (e) => `<div class="w-item ${catClass(e.category)}"><span class="w-time">${fmtTime(e.time) || 'All day'}</span>${Util.esc(e.title)}</div>`
    );
    i.workouts.forEach((w) => out.push(`<div class="w-act">🏋️ ${Util.esc(w.name)}</div>`));
    if (i.foods) out.push(`<div class="w-act">🥗 ${Math.round(i.kcal).toLocaleString()} kcal</div>`);
    if (i.study) out.push(`<div class="w-act">📚 ${Util.fmtMinutes(i.study)}</div>`);
    i.tasks.forEach((t) => out.push(`<div class="w-act ${t.done ? 'done' : ''}">${t.done ? '☑️' : '⬜'} ${Util.esc(t.text)}</div>`));
    return out.join('') || '<div class="muted small">Nothing yet</div>';
  }

  function renderWeek(info) {
    const start = Util.startOfWeek(cal.date);
    const today = Util.today();
    let cols = '';
    for (let n = 0; n < 7; n++) {
      const key = Util.addDays(start, n);
      const d = Util.parseDate(key);
      cols += `<div class="w-col ${key === today ? 'is-today' : ''}">
        <button class="w-head" data-day="${key}"><span class="muted small">${WEEKDAYS[n]}</span><span class="w-num">${d.getDate()}</span></button>
        <div class="w-body">${dayItems(key, info)}</div>
        <button class="btn small ghost w-add" data-add-on="${key}">+ Event</button>
      </div>`;
    }
    // Weekly totals
    let workouts = 0;
    let study = 0;
    let kcal = 0;
    let kDays = 0;
    for (let n = 0; n < 7; n++) {
      const i = info(Util.addDays(start, n));
      workouts += i.workouts.length;
      study += i.study;
      if (i.foods) {
        kcal += i.kcal;
        kDays++;
      }
    }
    return `<div class="year-stats">
        <div><b>${workouts}/${S().goals.workoutsPerWeek}</b><span class="muted small">workouts</span></div>
        <div><b>${Util.fmtMinutes(study)}</b><span class="muted small">studied</span></div>
        <div><b>${kDays ? Math.round(kcal / kDays).toLocaleString() : '–'}</b><span class="muted small">avg kcal / logged day</span></div>
      </div>
      <div class="week-cols">${cols}</div>`;
  }

  // ---------- Day ----------
  function renderDay(info) {
    const key = cal.date;
    const i = info(key);
    const g = S().goals;
    const ev = eventsOn(key);
    const unit = S().unit;
    const meter = (v, goal) =>
      `<div class="meter ${v > goal ? 'over' : ''}"><div style="width:${Math.min(100, goal ? (v / goal) * 100 : 0)}%"></div></div>`;
    return `<div class="grid two">
      <div class="card">
        <h2>Schedule</h2>
        <ul class="plain-list">${
          ev.length
            ? ev
                .map(
                  (e) => `<li><span class="d-event"><span class="tag ${catClass(e.category)}">${Util.esc(e.category)}</span>
                <span><b>${e.time || 'All day'}</b> ${Util.esc(e.title)}${e.repeat === 'weekly' ? ' <span class="muted small">↻ weekly</span>' : ''}
                ${e.notes ? `<div class="muted small">${Util.esc(e.notes)}</div>` : ''}</span></span>
                <button class="icon-btn" data-del-event="${e.id}" title="Delete${e.repeat === 'weekly' ? ' (whole series)' : ''}">✕</button></li>`
                )
                .join('')
            : '<li class="muted">No events. Add exams, deadlines, planned sessions…</li>'
        }</ul>
        <form id="event-form" class="event-form">
          <h3>Add event</h3>
          <input id="event-title" placeholder="e.g. Maths exam, Leg day, Dentist" required>
          <div class="row gap wrap">
            <input id="event-time" type="time" title="Leave empty for all day">
            <select id="event-category">${CATEGORIES.map((c) => `<option>${c}</option>`).join('')}</select>
            <select id="event-repeat"><option value="none">Doesn't repeat</option><option value="weekly">Every week</option></select>
          </div>
          <input id="event-notes" placeholder="Notes (optional)">
          <button class="btn primary" type="submit">Add to ${Util.fmtDate(key, { day: 'numeric', month: 'short' })}</button>
        </form>
      </div>
      <div class="stack">
        <div class="card">
          <h2>🏋️ Gym</h2>
          ${
            i.workouts.length
              ? i.workouts
                  .map(
                    (w) => `<p><b>${Util.esc(w.name)}</b> <span class="muted small">· ${Math.round(Gym.volume(w)).toLocaleString()} ${unit} volume</span></p>
                <ul class="ex-list">${w.exercises.map((x) => `<li><b>${Util.esc(x.name)}</b> ${x.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')}</li>`).join('')}</ul>`
                  )
                  .join('')
              : '<p class="muted">No workout logged.</p>'
          }
        </div>
        <div class="card">
          <h2>🥗 Nutrition</h2>
          ${
            i.foods
              ? `<div class="macro-head"><span>Calories</span><span><b>${Math.round(i.kcal)}</b> / ${g.calories}</span></div>${meter(i.kcal, g.calories)}
                 <div class="macro-head" style="margin-top:10px"><span>Protein</span><span><b>${Math.round(i.protein)}</b> / ${g.protein}g</span></div>${meter(i.protein, g.protein)}
                 <p class="muted small" style="margin-top:8px">${i.foods} item${i.foods > 1 ? 's' : ''} logged · ${((S().water[key] || 0) / 1000).toFixed(1)}L water</p>`
              : '<p class="muted">No food logged.</p>'
          }
          <button class="btn small" data-open-nutrition="${key}" style="margin-top:8px">Open food log</button>
        </div>
        <div class="card">
          <h2>📚 Study</h2>
          ${
            i.sessions.length
              ? `<p><b>${Util.fmtMinutes(i.study)}</b> <span class="muted">of ${Util.fmtMinutes(g.studyMinutes)} goal</span></p>${meter(i.study, g.studyMinutes)}
                 <ul class="ex-list">${i.sessions.map((s) => `<li>${Util.esc(s.subject)} · ${Util.fmtMinutes(s.minutes)}${s.note ? ` <span class="muted">· ${Util.esc(s.note)}</span>` : ''}</li>`).join('')}</ul>`
              : '<p class="muted">No study logged.</p>'
          }
          ${
            i.tasks.length
              ? `<h3>Tasks due</h3><ul class="plain-list">${i.tasks
                  .map((t) => `<li><label><input type="checkbox" data-cal-task="${t.id}" ${t.done ? 'checked' : ''}> ${Util.esc(t.text)}</label></li>`)
                  .join('')}</ul>`
              : ''
          }
        </div>
      </div>
    </div>`;
  }

  // ---------- Render ----------
  function render() {
    const info = buildIndex();
    $('#cal-title').textContent = title();
    document.querySelectorAll('[data-cal-view]').forEach((b) => b.classList.toggle('active', b.dataset.calView === cal.view));
    const body = $('#cal-body');
    if (cal.view === 'year') body.innerHTML = renderYear(info);
    else if (cal.view === 'month') body.innerHTML = renderMonth(info);
    else if (cal.view === 'week') body.innerHTML = renderWeek(info);
    else body.innerHTML = renderDay(info);
    if (cal.view === 'day') {
      $('#event-form').onsubmit = (e) => {
        e.preventDefault();
        const titleText = $('#event-title').value.trim();
        if (!titleText) return;
        S().events.push({
          id: Util.uid(),
          date: cal.date,
          time: $('#event-time').value,
          title: titleText,
          category: $('#event-category').value,
          repeat: $('#event-repeat').value,
          notes: $('#event-notes').value.trim(),
        });
        Store.save();
        App.toast('Event added');
      };
    }
  }

  function upcoming(days = 14) {
    const out = [];
    for (let n = 0; n < days; n++) {
      const key = Util.addDays(Util.today(), n);
      eventsOn(key).forEach((e) => out.push({ ...e, on: key }));
    }
    return out;
  }

  function init() {
    document.querySelectorAll('[data-cal-view]').forEach((b) => (b.onclick = () => go(b.dataset.calView)));
    $('#cal-prev').onclick = () => shift(-1);
    $('#cal-next').onclick = () => shift(1);
    $('#cal-today').onclick = () => {
      cal.date = Util.today();
      render();
    };
    $('#cal-add').onclick = () => {
      go('day');
      $('#event-title').focus();
    };
    $('#cal-body').onclick = (e) => {
      const day = e.target.closest('[data-day]');
      const month = e.target.closest('[data-month]');
      const addOn = e.target.closest('[data-add-on]');
      const del = e.target.closest('[data-del-event]');
      const task = e.target.closest('[data-cal-task]');
      const nutri = e.target.closest('[data-open-nutrition]');
      if (addOn) {
        go('day', addOn.dataset.addOn);
        $('#event-title').focus();
      } else if (day) go('day', day.dataset.day);
      else if (month) go('month', month.dataset.month);
      else if (del) {
        const ev = S().events.find((x) => x.id === del.dataset.delEvent);
        if (ev && (ev.repeat !== 'weekly' || confirm('This deletes every week of this repeating event. Continue?'))) {
          S().events = S().events.filter((x) => x.id !== ev.id);
          Store.save();
        }
      } else if (task) {
        S().tasks.find((t) => t.id === task.dataset.calTask).done = task.checked;
        Store.save();
      } else if (nutri) {
        Nutrition.setDay(nutri.dataset.openNutrition);
        location.hash = '#nutrition';
      }
    };
  }

  window.Calendar = { init, render, upcoming, eventsOn, catClass };
})();
