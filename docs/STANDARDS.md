# How we build Cramming

Two people build Cramming: the founder and Claude. These files are the record. If something isn't written here, it didn't happen.

| File | What it holds | When it changes |
|---|---|---|
| `docs/STANDARDS.md` | This page: the bar, the rules for code and testing, how work moves | Rarely, and only by decision |
| `docs/FEATURES.md` | Every feature: who uses it, its state, its files, its tests | Every time a feature changes state |
| `docs/CHANGELOG.md` | Every release: what changed, how it was tested | Every upload to the live site |
| `docs/DECISIONS.md` | Every decision that shapes the product, and why | When we decide something we'd otherwise forget |
| `docs/ISSUES.md` | Every problem found, its cause and its fix | The moment a problem is found, and again when it's fixed |
| System map (whiteboard) | The architecture, the roadmap, and a flow map for each feature: every screen, every button, where it leads, and any gap | Every time a flow changes |

## Flow checks

Every feature gets a flow map: start screen → each button or link → where it leads → the task finished. We walk every path and ask whether everything needed to finish the task is there. A missing button, a dead end, a confusing label or wrong data is recorded in `ISSUES.md` and marked on the map in orange until it's fixed.

## The bar

We ship few features, and each one is the finest of its kind. A feature is **finished** only when all of these are true:

1. A real professor and real students have used it on a real course.
2. It works on a phone and a laptop, in light and dark mode.
3. It's complete by keyboard and screen reader, and the automated accessibility check (axe) shows nothing.
4. Its empty, loading and error states are designed and written.
5. Every word has been reviewed: plain, kind, specific.
6. It stays inside the free limits with a full class (reads, writes and AI use counted).
7. It opens in under a second on a school laptop.
8. Every rule it follows has an automated test, and every test passes.
9. It has no unused or duplicate code (see below).

The six standards behind this list: **usability, accessibility, experience, the look, authenticity, optimisation.** Authenticity means students see only their professor's material, AI output is labelled, and a person makes every decision that matters.

## Feature states

Each feature in `FEATURES.md` is in exactly one state:

- **Planned:** agreed, not started.
- **Building:** being written.
- **Built, not uploaded:** finished and tested on the local copy, waiting for the founder's upload.
- **Live, unpolished:** on the site but not yet at the bar.
- **Polishing:** being brought to the bar now.
- **Finished:** meets every point of the bar.
- **Retired:** removed; the code is deleted, not commented out.

## How work moves

One piece at a time, in this order: the landing page, then students, then professors, then admins, then what runs behind it. For each piece:

1. **Plan:** say what changes and what "done" looks like, before any code.
2. **Build:** on the working branch, in small commits that each do one thing.
3. **Test:** run `npm test` (logic), the browser checks (screens), and axe (accessibility). All must pass.
4. **Record:** update `FEATURES.md`, and add a `CHANGELOG.md` entry.
5. **Release:** the founder uploads, waits for the green build, and checks the live site.

## Rules for code

- **No dead code.** No unused functions, exports, files, styles or commented-out blocks. `npm run audit` lists anything nothing uses, and its list must be empty before a release.
- **One way to do each thing.** Before writing a helper, look for one that already exists.
- **One file per job, named for that job.** A screen lives in `app/js/views/`, shared logic in `app/js/`, the connector in `connector/`.
- **Rules live in pure functions** (no page, no database) so they can be tested. Screens stay thin.
- **Every database read and write is counted** and noted in the file that makes it.
- **No secrets, rosters or student data in the repository.**

## Rules for testing

- Every rule gets a test that runs on every change: grading, dates, permissions, plans, limits.
- Every bug fixed gets a test that would have caught it.
- Coverage is measured and written in `FEATURES.md`. The aim: all shared logic close to 100%, and every screen covered by a browser check.
- Security rules are tested against a local copy of Firebase before they're published.
