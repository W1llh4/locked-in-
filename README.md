# 🔒 Locked In

One place to optimise your day to day: **gym progress, calorie tracking and studying/revision**.

No accounts, no installs, no build step. Everything is stored privately in your browser.

## Features

**Today (dashboard)**
- Calories, protein, water, study time and weekly workouts against your goals
- Activity streak and a 7-day overview of when you trained, logged food and studied
- Revision tasks due today, upcoming calendar events, and how many flashcards are waiting

**Calendar**
- **Year** view: every day shaded by how much you did (gym, food, study), with yearly totals
- **Month** view: your events plus icons for workouts, food and study on each day
- **Week** view: day-by-day columns with events, workouts, calories, study and tasks, plus weekly totals
- **Day** view: full breakdown of a single day, and where you add events
- Events for exams, deadlines, planned sessions etc., with time, category, notes and optional weekly repeat
- Upcoming events show on the Today page

**Gym**
- Log workouts with exercises and sets (weight × reps), with exercise autocomplete
- "Repeat workout" copies a past session so logging is quick
- Progress chart per exercise (estimated 1RM, top weight or volume)
- Automatic personal records, with a 🎉 when you beat one
- Bodyweight log with trend chart

**Nutrition**
- Daily food log by meal, with calories / protein / carbs / fat
- Progress bars against your macro goals
- Save foods for one-tap quick add; servings multiplier
- Water tracker
- 14-day calorie chart against your goal

**Study**
- Pomodoro focus timer (custom lengths, sound + notification, auto-logs sessions per subject)
- Revision to-do list with subjects and due dates
- Flashcard decks with spaced repetition (Again / Hard / Good / Easy; keyboard: space, 1–4) and bulk import
- Study time charts and a weekly breakdown by subject

**Settings**
- kg / lb, study and workout goals, light/dark theme
- Export / import a JSON backup (use this to move data between devices)

**Accounts & sync**
- Create an account (email + password) to back up your data and use it on any device
- Changes sync automatically; works offline and catches up when you're back online
- Data logged before signing in is merged into your account, nothing is lost

**Steps**
- Log daily steps in Gym, with a 14-day chart and goal; Steps tile on Today; steps in the calendar day view

## Setting up accounts (one-off)

1. In Supabase, open **SQL Editor → New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
2. In **Authentication → URL Configuration**, set **Site URL** to your site address (e.g. `https://w1llh4.github.io/locked-in-/`) and add it under **Redirect URLs** too. This is where confirmation and password-reset emails send you.
3. Optional: for just yourself, you can turn off **Authentication → Sign In / Providers → Email → Confirm email** to skip the confirmation email.

The project URL and publishable key are in `js/cloud.js`. The publishable key is meant to be public: each account can only read and write its own rows (row-level security).

## Running it

Open `index.html` in a browser. That's it.

### Put it online for free (GitHub Pages)
1. On GitHub, go to **Settings → Pages**.
2. Under "Build and deployment", choose **Deploy from a branch**, pick your branch and `/ (root)`, then save.
3. Your site will be live at `https://<your-username>.github.io/locked-in-/`.

On your phone, open the site and use **Add to Home Screen** to get it like an app.

> Data lives in each browser separately, so your phone and laptop won't sync automatically. Use Export/Import in Settings to move it.

## Project structure

```
index.html        page layout for every section
css/styles.css    styling (light + dark, mobile layout)
js/store.js       saving/loading data + date helpers
js/charts.js      small SVG chart library
js/gym.js         workouts, PRs, bodyweight
js/nutrition.js   food log, macros, water
js/study.js       focus timer, tasks, flashcards
js/calendar.js    year / month / week / day calendar and events
js/cloud.js       accounts and sync (Supabase)
js/vendor/        bundled Supabase client library
supabase/schema.sql  database tables and security rules
js/app.js         navigation, dashboard, settings
```
