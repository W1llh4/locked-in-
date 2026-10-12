// Nutrition: daily food log, macros vs goals, saved foods, water, trends.
(function () {
  const S = () => Store.state;
  const $ = (sel) => document.querySelector(sel);
  const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
  let day = Util.today();

  function totals(date) {
    return S()
      .foods.filter((f) => f.date === date)
      .reduce(
        (t, f) => ({
          calories: t.calories + f.calories,
          protein: t.protein + f.protein,
          carbs: t.carbs + f.carbs,
          fat: t.fat + f.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
  }

  function progress(label, value, goal, unit) {
    const pct = goal ? Math.min(100, (value / goal) * 100) : 0;
    const over = goal && value > goal;
    const left = goal - value;
    return `<div class="macro">
      <div class="macro-head"><span>${label}</span><span><b>${Math.round(value)}</b> / ${goal}${unit}</span></div>
      <div class="meter ${over ? 'over' : ''}"><div style="width:${pct}%"></div></div>
      <div class="muted small">${over ? `${Math.round(-left)}${unit} over` : `${Math.round(left)}${unit} left`}</div>
    </div>`;
  }

  function renderDay() {
    const g = S().goals;
    const t = totals(day);
    $('#nutri-date-label').textContent = day === Util.today() ? 'Today' : Util.fmtDate(day);
    $('#nutri-date').value = day;
    $('#macro-summary').innerHTML =
      progress('Calories', t.calories, g.calories, ' kcal') +
      progress('Protein', t.protein, g.protein, 'g') +
      progress('Carbs', t.carbs, g.carbs, 'g') +
      progress('Fat', t.fat, g.fat, 'g');

    const foods = S().foods.filter((f) => f.date === day);
    $('#food-log').innerHTML = MEALS.map((meal) => {
      const items = foods.filter((f) => f.meal === meal);
      const kcal = items.reduce((s, f) => s + f.calories, 0);
      return `<div class="meal">
        <div class="meal-head"><b>${meal}</b><span class="muted">${Math.round(kcal)} kcal</span></div>
        ${
          items.length
            ? items
                .map(
                  (f) => `<div class="food-item">
            <div><div>${Util.esc(f.name)}</div><div class="muted small">P ${f.protein}g · C ${f.carbs}g · F ${f.fat}g</div></div>
            <div class="row gap"><span>${Math.round(f.calories)}</span><button class="icon-btn" data-del-food="${f.id}" title="Remove">✕</button></div>
          </div>`
                )
                .join('')
            : '<div class="muted small empty-meal">Nothing logged</div>'
        }</div>`;
    }).join('');

    const water = S().water[day] || 0;
    const wPct = Math.min(100, (water / g.water) * 100);
    $('#water-amount').textContent = `${(water / 1000).toFixed(2)} L / ${(g.water / 1000).toFixed(1)} L`;
    $('#water-meter').style.width = `${wPct}%`;
  }

  function renderTrend() {
    const g = S().goals;
    const data = Util.lastNDays(14).map((d) => ({
      label: Util.fmtDate(d, { day: 'numeric', month: 'short' }),
      value: Math.round(totals(d).calories),
      protein: Math.round(totals(d).protein),
    }));
    Charts.bar($('#calorie-chart'), data, {
      goal: g.calories,
      goalLabel: `Goal ${g.calories}`,
      tipFmt: (p) => `<b>${p.value.toLocaleString()} kcal</b><span>${Util.esc(p.label)} · ${p.protein}g protein</span>`,
      ariaLabel: 'Calories over the last 14 days',
    });
    const logged = data.filter((d) => d.value > 0);
    const avg = logged.length ? Math.round(logged.reduce((s, d) => s + d.value, 0) / logged.length) : 0;
    $('#calorie-avg').textContent = logged.length ? `Average ${avg.toLocaleString()} kcal over ${logged.length} logged days` : '';
  }

  function renderSaved() {
    const saved = S().savedFoods;
    $('#saved-foods').innerHTML = saved.length
      ? saved
          .map(
            (f, i) => `<button class="chip" data-quick="${i}" title="P ${f.protein} · C ${f.carbs} · F ${f.fat}">
          ${Util.esc(f.name)} <span class="muted">${Math.round(f.calories)}</span>
          <span class="chip-x" data-unsave="${i}" title="Remove from saved">✕</span></button>`
          )
          .join('')
      : '<span class="muted small">Tick "Save for quick add" when logging a food to keep it here.</span>';
    $('#food-suggestions').innerHTML = saved.map((f) => `<option value="${Util.esc(f.name)}">`).join('');
  }

  function render() {
    renderDay();
    renderTrend();
    renderSaved();
    const g = S().goals;
    ['calories', 'protein', 'carbs', 'fat', 'water'].forEach((k) => {
      const el = $(`#goal-${k}`);
      if (el && document.activeElement !== el) el.value = g[k];
    });
  }

  function addFood(food) {
    S().foods.push({ id: Util.uid(), date: day, ...food });
    Store.save();
  }

  function init() {
    $('#food-form').onsubmit = (e) => {
      e.preventDefault();
      const food = {
        meal: $('#food-meal').value,
        name: $('#food-name').value.trim(),
        calories: Util.num($('#food-cal').value),
        protein: Util.num($('#food-p').value),
        carbs: Util.num($('#food-c').value),
        fat: Util.num($('#food-f').value),
      };
      if (!food.name) return;
      const servings = Util.num($('#food-servings').value, 1) || 1;
      ['calories', 'protein', 'carbs', 'fat'].forEach((k) => (food[k] = Util.round(food[k] * servings, 1)));
      if ($('#food-save').checked && !S().savedFoods.some((f) => f.name.toLowerCase() === food.name.toLowerCase())) {
        const per = { name: food.name };
        ['calories', 'protein', 'carbs', 'fat'].forEach((k) => (per[k] = Util.round(food[k] / servings, 1)));
        S().savedFoods.push(per);
      }
      if (servings !== 1) food.name = `${food.name} ×${servings}`;
      addFood(food);
      $('#food-form').reset();
      $('#food-meal').value = food.meal;
      $('#food-name').focus();
    };
    // Autofill macros when a saved food name is typed/picked
    $('#food-name').addEventListener('input', () => {
      const f = S().savedFoods.find((x) => x.name.toLowerCase() === $('#food-name').value.trim().toLowerCase());
      if (f) {
        $('#food-cal').value = f.calories;
        $('#food-p').value = f.protein;
        $('#food-c').value = f.carbs;
        $('#food-f').value = f.fat;
      }
    });
    $('#saved-foods').onclick = (e) => {
      const un = e.target.closest('[data-unsave]');
      if (un) {
        e.stopPropagation();
        S().savedFoods.splice(Number(un.dataset.unsave), 1);
        Store.save();
        return;
      }
      const q = e.target.closest('[data-quick]');
      if (q) {
        const { name, calories, protein, carbs, fat } = S().savedFoods[Number(q.dataset.quick)];
        addFood({ meal: $('#food-meal').value, name, calories, protein, carbs, fat });
        App.toast(`Added ${name}`);
      }
    };
    $('#food-log').onclick = (e) => {
      const del = e.target.closest('[data-del-food]');
      if (del) {
        S().foods = S().foods.filter((f) => f.id !== del.dataset.delFood);
        Store.save();
      }
    };
    $('#nutri-prev').onclick = () => {
      day = Util.addDays(day, -1);
      render();
    };
    $('#nutri-next').onclick = () => {
      day = Util.addDays(day, 1);
      render();
    };
    $('#nutri-date').onchange = (e) => {
      if (e.target.value) day = e.target.value;
      render();
    };
    document.querySelectorAll('[data-water]').forEach(
      (b) =>
        (b.onclick = () => {
          S().water[day] = Math.max(0, (S().water[day] || 0) + Number(b.dataset.water));
          Store.save();
        })
    );
    $('#goals-form').onsubmit = (e) => {
      e.preventDefault();
      ['calories', 'protein', 'carbs', 'fat', 'water'].forEach((k) => (S().goals[k] = Util.num($(`#goal-${k}`).value, S().goals[k])));
      Store.save();
      App.toast('Goals updated');
    };
  }

  function setDay(d) {
    day = d;
  }

  window.Nutrition = { init, render, totals, setDay };
})();
