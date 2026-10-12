// Persistent app state, saved to localStorage.
(function () {
  const KEY = 'locked-in:v1';

  const defaults = () => ({
    goals: { calories: 2500, protein: 160, carbs: 280, fat: 75, water: 3000, studyMinutes: 120, workoutsPerWeek: 4 },
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
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      const base = defaults();
      return { ...base, ...data, goals: { ...base.goals, ...(data.goals || {}) } };
    } catch (e) {
      console.warn('Could not load saved data', e);
      return defaults();
    }
  }

  const listeners = [];

  const Store = {
    state: load(),
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch (e) {
        console.warn('Could not save data', e);
      }
      listeners.forEach((fn) => fn(this.state));
    },
    onChange(fn) {
      listeners.push(fn);
    },
    replace(data) {
      const base = defaults();
      this.state = { ...base, ...data, goals: { ...base.goals, ...(data.goals || {}) } };
      this.save();
    },
    reset() {
      this.state = defaults();
      this.save();
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
