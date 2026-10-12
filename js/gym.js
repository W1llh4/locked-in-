// Gym: workout logging, exercise progress, personal records, bodyweight.
(function () {
  const S = () => Store.state;
  const $ = (sel) => document.querySelector(sel);

  // Epley estimated one-rep max
  const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30));

  function exerciseNames() {
    const set = new Set();
    S().workouts.forEach((w) => w.exercises.forEach((e) => set.add(e.name)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function volume(workout) {
    return workout.exercises.reduce((t, e) => t + e.sets.reduce((s, x) => s + x.reps * x.weight, 0), 0);
  }

  // ---------- Workout builder ----------
  function exerciseRow(ex = { name: '', sets: [{ reps: '', weight: '' }] }) {
    const div = document.createElement('div');
    div.className = 'exercise-block';
    div.innerHTML = `
      <div class="row">
        <input class="ex-name" list="exercise-list" placeholder="Exercise (e.g. Bench Press)" value="${Util.esc(ex.name)}" required>
        <button type="button" class="icon-btn danger remove-ex" title="Remove exercise">✕</button>
      </div>
      <div class="sets"></div>
      <button type="button" class="btn small ghost add-set">+ Set</button>`;
    const sets = div.querySelector('.sets');
    ex.sets.forEach((s) => sets.appendChild(setRow(s)));
    div.querySelector('.add-set').onclick = () => {
      const last = sets.lastElementChild;
      sets.appendChild(
        setRow(last ? { reps: last.querySelector('.reps').value, weight: last.querySelector('.weight').value } : {})
      );
      renumber(sets);
    };
    div.querySelector('.remove-ex').onclick = () => div.remove();
    renumber(sets);
    return div;
  }

  function setRow(s = {}) {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <span class="set-num"></span>
      <input class="weight" type="number" step="0.5" min="0" placeholder="${S().unit}" value="${s.weight ?? ''}">
      <span class="x">×</span>
      <input class="reps" type="number" step="1" min="0" placeholder="reps" value="${s.reps ?? ''}">
      <button type="button" class="icon-btn remove-set" title="Remove set">−</button>`;
    row.querySelector('.remove-set').onclick = () => {
      const parent = row.parentElement;
      row.remove();
      renumber(parent);
    };
    return row;
  }

  function renumber(sets) {
    [...sets.children].forEach((r, i) => (r.querySelector('.set-num').textContent = i + 1));
  }

  function loadIntoBuilder(workout, keepDate = false) {
    $('#workout-name').value = workout.name;
    $('#workout-notes').value = workout.notes || '';
    if (!keepDate) $('#workout-date').value = Util.today();
    const list = $('#exercise-builder');
    list.innerHTML = '';
    workout.exercises.forEach((e) => list.appendChild(exerciseRow(JSON.parse(JSON.stringify(e)))));
    $('#workout-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetBuilder() {
    $('#workout-form').reset();
    $('#workout-date').value = Util.today();
    $('#exercise-builder').innerHTML = '';
    $('#exercise-builder').appendChild(exerciseRow());
  }

  function saveWorkout(e) {
    e.preventDefault();
    const exercises = [...document.querySelectorAll('#exercise-builder .exercise-block')]
      .map((b) => ({
        name: b.querySelector('.ex-name').value.trim(),
        sets: [...b.querySelectorAll('.set-row')]
          .map((r) => ({ weight: Util.num(r.querySelector('.weight').value), reps: Util.num(r.querySelector('.reps').value) }))
          .filter((s) => s.reps > 0),
      }))
      .filter((x) => x.name && x.sets.length);
    if (!exercises.length) {
      App.toast('Add at least one exercise with a set');
      return;
    }
    const prsBefore = bestByExercise();
    const workout = {
      id: Util.uid(),
      date: $('#workout-date').value || Util.today(),
      name: $('#workout-name').value.trim() || 'Workout',
      notes: $('#workout-notes').value.trim(),
      exercises,
    };
    S().workouts.push(workout);
    S().workouts.sort((a, b) => a.date.localeCompare(b.date));
    Store.save();
    const newPRs = exercises.filter((x) => {
      const best = Math.max(...x.sets.map((s) => e1rm(s.weight, s.reps)));
      return prsBefore[x.name] && best > prsBefore[x.name].e1rm;
    });
    App.toast(newPRs.length ? `Workout saved — new PR on ${newPRs.map((x) => x.name).join(', ')}! 🎉` : 'Workout saved 💪');
    resetBuilder();
  }

  // ---------- Stats ----------
  function bestByExercise() {
    const best = {};
    S().workouts.forEach((w) =>
      w.exercises.forEach((x) =>
        x.sets.forEach((s) => {
          const est = e1rm(s.weight, s.reps);
          const b = best[x.name];
          if (!b || est > b.e1rm) best[x.name] = { e1rm: est, weight: s.weight, reps: s.reps, date: w.date };
          if (!best[x.name].heaviest || s.weight > best[x.name].heaviest) best[x.name].heaviest = s.weight;
        })
      )
    );
    return best;
  }

  function renderProgress() {
    const sel = $('#progress-exercise');
    const names = exerciseNames();
    const current = sel.value;
    sel.innerHTML = names.length
      ? names.map((n) => `<option ${n === current ? 'selected' : ''}>${Util.esc(n)}</option>`).join('')
      : '<option value="">No exercises yet</option>';
    const name = sel.value;
    const metric = $('#progress-metric').value;
    const data = [];
    S().workouts.forEach((w) => {
      const ex = w.exercises.filter((x) => x.name === name);
      if (!ex.length) return;
      const sets = ex.flatMap((x) => x.sets);
      let value;
      if (metric === 'e1rm') value = Math.max(...sets.map((s) => e1rm(s.weight, s.reps)));
      else if (metric === 'weight') value = Math.max(...sets.map((s) => s.weight));
      else value = sets.reduce((t, s) => t + s.weight * s.reps, 0);
      data.push({ label: Util.fmtDate(w.date, { day: 'numeric', month: 'short' }), value: Util.round(value, 1) });
    });
    const unit = S().unit;
    Charts.line($('#progress-chart'), data, {
      yFmt: (v) => `${Util.round(v, 1)}`,
      tipFmt: (p) => `<b>${p.value} ${unit}</b><span>${Util.esc(p.label)}</span>`,
      emptyMsg: 'Log a workout to see your progress',
      ariaLabel: `${name} progress`,
    });
  }

  function renderPRs() {
    const best = bestByExercise();
    const rows = Object.entries(best).sort((a, b) => b[1].e1rm - a[1].e1rm);
    const unit = S().unit;
    $('#pr-table').innerHTML = rows.length
      ? `<table><thead><tr><th>Exercise</th><th>Best set</th><th>Est. 1RM</th><th>Heaviest</th><th>Date</th></tr></thead><tbody>
        ${rows
          .map(
            ([n, b]) => `<tr><td>${Util.esc(n)}</td><td>${b.weight}${unit} × ${b.reps}</td><td><b>${Util.round(b.e1rm, 1)}${unit}</b></td>
            <td>${b.heaviest}${unit}</td><td class="muted">${Util.fmtDate(b.date, { day: 'numeric', month: 'short' })}</td></tr>`
          )
          .join('')}</tbody></table>`
      : '<p class="muted">Your personal records will show up here.</p>';
  }

  function renderHistory() {
    const unit = S().unit;
    const list = [...S().workouts].reverse().slice(0, 30);
    $('#workout-history').innerHTML = list.length
      ? list
          .map(
            (w) => `<details class="history-item">
          <summary><span><b>${Util.esc(w.name)}</b> <span class="muted">· ${Util.fmtDate(w.date)}</span></span>
          <span class="muted">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${Math.round(volume(w)).toLocaleString()} ${unit}</span></summary>
          <ul class="ex-list">${w.exercises
            .map((x) => `<li><b>${Util.esc(x.name)}</b> ${x.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')}</li>`)
            .join('')}</ul>
          ${w.notes ? `<p class="muted">${Util.esc(w.notes)}</p>` : ''}
          <div class="row gap">
            <button class="btn small" data-repeat="${w.id}">Repeat workout</button>
            <button class="btn small ghost danger" data-del-workout="${w.id}">Delete</button>
          </div></details>`
          )
          .join('')
      : '<p class="muted">No workouts logged yet. Your history will appear here.</p>';
  }

  function renderBodyweight() {
    const unit = S().unit;
    const bw = [...S().bodyweight].sort((a, b) => a.date.localeCompare(b.date));
    Charts.line(
      $('#bw-chart'),
      bw.slice(-60).map((b) => ({ label: Util.fmtDate(b.date, { day: 'numeric', month: 'short' }), value: b.weight })),
      {
        tipFmt: (p) => `<b>${p.value} ${unit}</b><span>${Util.esc(p.label)}</span>`,
        emptyMsg: 'Log your bodyweight to track the trend',
        ariaLabel: 'Bodyweight over time',
      }
    );
    const latest = bw[bw.length - 1];
    const weekAgo = bw.filter((b) => b.date <= Util.addDays(Util.today(), -7)).pop();
    $('#bw-summary').innerHTML = latest
      ? `Latest: <b>${latest.weight} ${unit}</b>${
          weekAgo ? ` · ${latest.weight - weekAgo.weight >= 0 ? '+' : ''}${Util.round(latest.weight - weekAgo.weight, 1)} ${unit} vs a week ago` : ''
        }`
      : '';
  }

  function renderSteps() {
    const goal = S().goals.steps;
    const data = Util.lastNDays(14).map((d) => ({
      label: Util.fmtDate(d, { day: 'numeric', month: 'short' }),
      value: (S().health[d] && S().health[d].steps) || 0,
    }));
    Charts.bar($('#steps-chart'), data, {
      goal,
      goalLabel: `Goal ${goal.toLocaleString()}`,
      yFmt: (v) => (v >= 1000 ? `${Util.round(v / 1000, 1)}k` : v),
      tipFmt: (p) => `<b>${p.value.toLocaleString()} steps</b><span>${Util.esc(p.label)}</span>`,
      ariaLabel: 'Steps over the last 14 days',
    });
    const logged = data.filter((d) => d.value > 0);
    const today = (S().health[Util.today()] || {}).steps;
    const avg = logged.length ? Math.round(logged.reduce((t, d) => t + d.value, 0) / logged.length) : 0;
    $('#steps-summary').innerHTML = logged.length
      ? `Today: <b>${(today || 0).toLocaleString()}</b> · 14-day average ${avg.toLocaleString()} · goal hit on ${logged.filter((d) => d.value >= goal).length} days`
      : '';
  }

  function render() {
    $('#exercise-list').innerHTML = exerciseNames()
      .concat(['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull Up', 'Lat Pulldown', 'Romanian Deadlift', 'Leg Press', 'Bicep Curl', 'Tricep Pushdown', 'Lateral Raise'])
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((n) => `<option value="${Util.esc(n)}">`)
      .join('');
    document.querySelectorAll('.unit-label').forEach((el) => (el.textContent = S().unit));
    renderProgress();
    renderPRs();
    renderHistory();
    renderBodyweight();
    renderSteps();
  }

  function init() {
    resetBuilder();
    $('#add-exercise').onclick = () => $('#exercise-builder').appendChild(exerciseRow());
    $('#workout-form').onsubmit = saveWorkout;
    $('#progress-exercise').onchange = renderProgress;
    $('#progress-metric').onchange = renderProgress;
    $('#bw-date').value = Util.today();
    $('#bw-form').onsubmit = (e) => {
      e.preventDefault();
      const weight = Util.num($('#bw-weight').value);
      const date = $('#bw-date').value || Util.today();
      if (!weight) return;
      S().bodyweight = S().bodyweight.filter((b) => b.date !== date);
      S().bodyweight.push({ id: Util.uid(), date, weight });
      Store.save();
      $('#bw-weight').value = '';
      App.toast('Bodyweight logged');
    };
    $('#steps-date').value = Util.today();
    $('#steps-form').onsubmit = (e) => {
      e.preventDefault();
      const steps = Math.round(Util.num($('#steps-value').value, -1));
      const date = $('#steps-date').value || Util.today();
      if (steps < 0) return;
      S().health[date] = { ...S().health[date], steps };
      Store.save();
      $('#steps-value').value = '';
      App.toast('Steps logged');
    };
    $('#workout-history').onclick = (e) => {
      const rep = e.target.closest('[data-repeat]');
      const del = e.target.closest('[data-del-workout]');
      if (rep) loadIntoBuilder(S().workouts.find((w) => w.id === rep.dataset.repeat));
      if (del && confirm('Delete this workout?')) {
        S().workouts = S().workouts.filter((w) => w.id !== del.dataset.delWorkout);
        Store.save();
      }
    };
  }

  window.Gym = { init, render, volume, e1rm };
})();
