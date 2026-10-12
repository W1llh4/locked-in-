// Persistent app state, saved to localStorage.
(function () {
  const KEY = 'locked-in:v1';

  const defaults = () => ({
    goals: { calories: 2500, protein: 160, carbs: 280, fat: 75, water: 3000, studyMinutes: 120, workoutsPerWeek: 4, steps: 10000 },
    unit: 'kg',
    workouts: [],      // {id, date, name, notes, exercises:[{name, sets:[{reps, weight}]}]}
    bodyweight: [],    // {id, date, weight}
    foods: [],         // {id, date, meal, name, calories, protein, carbs, fat}
    savedFoods: [],    // {name, calories, protein, carbs, fat}
    water: {},         // {date: ml}
    subjects: ['Maths', 'English', 'Science'],
    studySessions: [], // {id, date, subject, minutes, note}
    decks: [],         // {id, name, cards:[{id, front, back, due, interval, ease, reps}]}
    tasks: [],         // {id, text, subject, due, done}
    events: [],        // {id, date, time, title, category, repeat:'none'|'weekly', notes}
    health: {},        // {date: {steps, activeKcal, sleepHours}}
  });

  function withDefaults(data) {
    const base = defaults();
    return { ...base, ...data, goals: { ...base.goals, ...(data.goals || {}) } };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? withDefaults(JSON.parse(raw)) : defaults();
    } catch (e) {
      console.warn('Could not load saved data', e);
      return defaults();
    }
  }

  const listeners = [];

  const Store = {
    state: load(),
    // opts.fromCloud: the change came from the server, so don't upload it again
    save(opts = {}) {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch (e) {
        console.warn('Could not save data', e);
      }
      listeners.forEach((fn) => fn(this.state, opts));
    },
    onChange(fn) {
      listeners.push(fn);
    },
    replace(data, opts) {
      this.state = withDefaults(data || {});
      this.save(opts);
    },
    reset(opts) {
      this.state = defaults();
      this.save(opts);
    },
    // True when nothing has been logged yet (fresh device)
    isEmpty(state = this.state) {
      return ['workouts', 'bodyweight', 'foods', 'studySessions', 'decks', 'tasks', 'events'].every((k) => !(state[k] || []).length) &&
        !Object.keys(state.health || {}).length;
    },
    // Combine two copies of the data (e.g. phone + laptop edited while offline).
    // Nothing is lost: lists are joined by id, and `newer` wins where both have the same item.
    merge(older, newer) {
      const a = withDefaults(older || {});
      const b = withDefaults(newer || {});
      const byId = (x = [], y = []) => {
        const m = new Map();
        x.forEach((i) => m.set(i.id, i));
        y.forEach((i) => m.set(i.id, i));
        return [...m.values()];
      };
      const out = { ...a, ...b, goals: { ...defaults().goals, ...((older && older.goals) || {}), ...((newer && newer.goals) || {}) } };
      ['bodyweight', 'foods', 'studySessions', 'tasks', 'events'].forEach((k) => (out[k] = byId(a[k], b[k])));
      out.workouts = byId(a.workouts, b.workouts).sort((p, q) => p.date.localeCompare(q.date));
      const oldDecks = new Map(a.decks.map((d) => [d.id, d]));
      out.decks = byId(a.decks, b.decks).map((d) => (oldDecks.has(d.id) ? { ...d, cards: byId(oldDecks.get(d.id).cards, d.cards) } : d));
      const foods = new Map();
      [...a.savedFoods, ...b.savedFoods].forEach((f) => foods.set(f.name.toLowerCase(), f));
      out.savedFoods = [...foods.values()];
      out.subjects = [...new Set([...a.subjects, ...b.subjects])];
      out.water = { ...a.water };
      Object.entries(b.water).forEach(([d, ml]) => (out.water[d] = Math.max(ml, out.water[d] || 0)));
      out.health = { ...a.health };
      Object.entries(b.health).forEach(([d, h]) => (out.health[d] = { ...out.health[d], ...h }));
      return out;
    },
  };

  // Shared helpers
  const pad = (n) => String(n).padStart(2, '0');
  const Util = {
    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    today: () => Util.dateKey(new Date()),
    dateKey: (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    parseDate: (key) => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d);
    },
    addDays: (key, n) => {
      const d = Util.parseDate(key);
      d.setDate(d.getDate() + n);
      return Util.dateKey(d);
    },
    lastNDays: (n) => {
      const out = [];
      for (let i = n - 1; i >= 0; i--) out.push(Util.addDays(Util.today(), -i));
      return out;
    },
    startOfWeek: (key = Util.today()) => {
      const d = Util.parseDate(key);
      const day = (d.getDay() + 6) % 7; // Monday = 0
      d.setDate(d.getDate() - day);
      return Util.dateKey(d);
    },
    fmtDate: (key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
      Util.parseDate(key).toLocaleDateString(undefined, opts),
    fmtMinutes: (m) => {
      m = Math.round(m);
      const h = Math.floor(m / 60);
      return h ? `${h}h ${m % 60}m` : `${m}m`;
    },
    esc: (s) =>
      String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    num: (v, fallback = 0) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    },
    round: (n, dp = 0) => {
      const f = 10 ** dp;
      return Math.round(n * f) / f;
    },
  };

  window.Store = Store;
  window.Util = Util;
})();
