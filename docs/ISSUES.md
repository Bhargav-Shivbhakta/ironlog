# Issues

Every problem found in Cramming, from anyone, newest first. Each issue stays here until it's fixed and the fix is tested, then moves to **Fixed** with the commit that fixed it.

For each issue: what happened, where (screen and steps), the cause once known, and the fix. Every fix adds a test or a flow check that would have caught it.

## Open

### I-2. A new practice set (Midterm 3) shows 300 questions from Midterm 2

- **Reported:** 17 November 2026, by the founder.
- **Where:** Professor › class › Practice. A practice set for Midterm 3 was created, and it shows the 300 questions of the Midterm 2 practice set.
- **Cause:** not yet known, because the code alone doesn't show it. Each set's questions are saved under its own ID (`classes/{class}/examFiles/{examId}`), and a new set's ID comes from its name, so two sets shouldn't share questions. Likely causes to check:
  1. The question file uploaded for Midterm 3 was the Midterm 2 file. The name box fills itself from the file's title, which hides the mix-up.
  2. Midterm 3 was made by renaming the Midterm 2 set. **Rename** changes only the name students see, not the questions.
  3. A stale copy of Midterm 2 is being shown.
- **Next:** repeat the exact steps on the local copy of the site. The founder to say how Midterm 3 was created (Add a practice set, or Rename) and which file was chosen.
- **Fix, whatever the cause:** before publishing, show which file was chosen and its first questions, and warn when a file matches another set in the class.

### I-1. Programming practice can't be created or uploaded where you'd expect

- **Reported:** 17 November 2026, by the founder.
- **Where:** Professor › class › Practice.
- **What happens:**
  1. **Add a practice set** only accepts a question file (.md). There's no way to start a practice set with only programming assignments (a .zip).
  2. Assignments can only be added to a set that already exists, using its **Add assignments** button.
  3. That opens a panel at the bottom of the page, below every set, so it reads as a separate menu.
  4. The panel has no button called "Upload". It has **Choose .zip** and **Choose a folder**, and a **Publish assignments** button that stays greyed out until every reference solution passes its tests. When the zip has no solutions, or a solution fails, it doesn't say clearly why Publish is unavailable.
- **Cause:** a design gap in `app/js/views/content.js`: the panel is drawn after the list (`data-panel`), and creating a set requires a .md.
- **Fix:**
  - One **Add a practice set** that accepts a question file, an assignments .zip, or both.
  - The panel opens directly under the button that opened it.
  - Plain labels: **Upload .zip**, then **Publish**.
  - A clear line saying what's stopping Publish.
  - A flow check that creates a programming-only set from start to finish.

## Fixed

Nothing yet.
