# 🔒 Locked In

One place to optimise your day to day: **gym progress, calorie tracking and studying/revision**.

No accounts, no installs, no build step. Everything is stored privately in your browser.

## Features

**Today (dashboard)**
- Calories, protein, water, study time and weekly workouts against your goals
- Activity streak and a 7-day overview of when you trained, logged food and studied
- Revision tasks due today, and how many flashcards are waiting

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
js/app.js         navigation, dashboard, settings
```
