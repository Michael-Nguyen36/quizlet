# Quiz

A small static quiz web app. Plain HTML / JS / CSS, no framework, no server, no build step. Stores progress in `localStorage`. Installable on iPhone via "Add to Home Screen" and works offline.

## Try it locally

```bash
# from D:\quiz
python -m http.server 8000
# then open http://localhost:8000
```

Or with Node:

```bash
npx --yes serve .
```

> Don't open `index.html` by double-clicking — `fetch("questions.json")` and the service worker need an `http://` origin.

## Plug in the real 400 questions

1. In Google Docs / Word: save the file as `D:\quiz\source.docx`.
2. The parser handles three answer-marking styles, the first being the most common in Word docs:
   - **Bold or italic** on the correct choice (e.g. `**c)** Tokyo` or `*c) Tokyo*`).
   - **`Answer: B`** on its own line under the four choices.
   - **`*B. text`** — a literal asterisk before the letter of the correct choice.
3. Run:

   ```bash
   cd D:\quiz\tools
   npm install              # one-time
   npm run parse            # writes ../questions.json
   npm run validate -- ../questions.json 400
   ```

4. Spot-check a few entries against the original doc.

Questions with fewer than 4 choices are kept as-is (the app shows however many choices are present). The parser only skips a question if it has fewer than 2 choices or no answer is marked.

## Deploy free on GitHub Pages

```bash
cd D:\quiz
git init
git add .
git commit -m "initial"
# create the repo on github.com first (e.g. quiz-for-her), then:
git remote add origin https://github.com/<you>/quiz-for-her.git
git branch -M main
git push -u origin main
```

In the GitHub repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → main / root → Save**. After ~1 min:

`https://<you>.github.io/quiz-for-her/`

Send her the link. On her iPhone in Safari: **Share → Add to Home Screen**.

When you push new questions or code, also bump `CACHE_NAME` in `sw.js` (e.g. `quiz-v1` → `quiz-v2`) so devices fetch the new version instead of using the cached old one.

## How sessions work

- 20 questions per session by default (`SESSION_SIZE` in `app.js`).
- "Start session" pulls **due** questions, prioritizing ones in lower Leitner boxes.
- "Practice all (random)" ignores due-dates and pulls 20 random questions.
- Questions and the order of A/B/C/D are shuffled every session.
- Each answer updates a 5-box Leitner state stored under `localStorage["quiz.v1.state"]`:
  - Right → promote one box (max 5).
  - Wrong → back to box 1.
  - Box review intervals (days): 1 → every session, 2 → 1, 3 → 2, 4 → 4, 5 → 7, 6 → 14.

## Sync between iPhone and MacBook (optional)

Progress is per-device. If she wants to move it manually:
- **Home → Advanced → Export progress** copies the JSON to clipboard.
- On the other device, **Advanced → Import progress**, paste it.

That's it for v1. If you later want auto-sync, drop in Firebase Firestore or Supabase free tier — the `state` shape in `app.js` is small and trivially syncable.

## File map

```
index.html              UI shell
app.js                  state, Leitner SRS, shuffle, render, localStorage
styles.css              mobile-first, light + dark
questions.json          the questions (replace the sample with your real 400)
manifest.webmanifest    PWA metadata
sw.js                   service worker (offline cache)
icons/                  SVG + generated PNGs
tools/
  parse_docx.mjs        .docx → questions.json
  validate.mjs          shape & count check
  make_icons.mjs        SVG → PNG generator
  test_parser.mjs       parser smoke tests
  package.json          mammoth + @resvg/resvg-js
```
