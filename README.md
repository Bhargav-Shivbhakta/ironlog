# Exam Practice

A free practice-exam website for your students. No logins, no database, no server.

Students open a link and can:

- **Timed practice test:** the questions marked `on-exam`, in order, with a timer, scored at the end (answer choices are shuffled each time)
- **Random practice test:** a fresh exam every time, drawn from the whole bank with the same length and topic mix as the real one
- **Practice by topic,** run the **full question bank,** or build a **custom exam** (topics, difficulty, length, timer)
- Use **smart review** (spaced repetition), **my mistakes**, **saved questions** and **flashcards**
- **Browse** every question with search, answers and private notes
- Flag questions, cross out choices, use the built-in calculator, pause, and resume later
- See their scores, weakest topics, most-missed questions and an exam-readiness estimate
- Do **programming assignments**: write Java in the browser, run it with their own input, and check it against your tests instantly (compile errors look exactly like `javac`'s, and wrong output is shown side by side with the expected output)

On their first visit, students **pick their classes** (for example CS150). The home page then shows only those classes; they can change this any time in **Settings → My classes**.

**Two ways to run it:**

- **Without sign-in (default):** each student's progress is stored only in their own browser. The details are below.
- **With school sign-in (optional, free):** students sign in with their school Google account (for example `@sdsu.edu` only), their progress and assignment code follow them to any device, and you get an **Instructor dashboard** with every student's progress. See [Student sign-in](#7-student-sign-in-optional).

**Privacy without sign-in:** each student's progress is stored **only in their own browser**. Nothing is sent anywhere, so students can't see each other's data, and you don't see it either. Students can move progress between devices with **Settings → Export / Import**.

---

## 1. Put it online (one time, about 10 minutes)

You need a free GitHub account.

1. Create a new repository on GitHub (it can be private if your GitHub plan allows Pages on private repos; otherwise public).
2. Upload this whole folder to it. Either:
   - drag the files into the GitHub web page (**Add file → Upload files**), or
   - from a terminal:
     ```bash
     git init && git add . && git commit -m "Exam practice site"
     git branch -M main
     git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
     git push -u origin main
     ```
3. On GitHub, go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Go to the **Actions** tab and wait for "Check and publish" to turn green (about a minute). If it already ran before step 3, click it and choose **Re-run all jobs**.
5. Your site is at `https://YOUR-NAME.github.io/YOUR-REPO/`. Share that link with students.

From then on, **every time you push a change, the site checks your questions and republishes itself.** If a question file has a mistake, nothing is published (the previous version stays up) and the **Actions** tab shows the exact file and line to fix.

Cost: $0. GitHub Pages is free and handles thousands of visitors.

---

## 2. Folder layout

```
exams/
  midterm-2/
    questions.md      ← the questions for one exam
    images/           ← pictures used in those questions
  final/
    questions.md
  _template/          ← copied when you make a new exam (folders starting with _ are ignored)
app/                  ← the website itself (you don't need to touch this)
  config.js           ← site name, tagline and footer text
scripts/              ← build, preview and checking tools
.github/workflows/    ← automatic checking and publishing
```

**Every folder in `exams/` that contains a `questions.md` becomes an exam on the site.** You can also group exams by subject, one level deeper:

```
exams/
  CS150/
    Midterm 2/questions.md
    Final/questions.md
  CS160/
    Midterm 1/questions.md
```

The subject folder name (CS150) becomes the course label. On their first visit students choose which subjects they're taking, and the home page shows only those (they can change it in Settings). Each subject also gets its own link such as `…/#/course/cs150`; opening it counts as choosing that subject, so it's the best link to share with one class. When you add a new subject later, students who already chose see a "New on the site" note and can add it. Each subject can have its own `active: true` exam. You never edit a list of exams. Adding or deleting a folder adds or removes an exam.

To change the site name shown at the top, edit `app/config.js`.

---

## 3. Adding a new exam

### Option A: you have the questions as a PDF or Word file

1. Give the file to Claude and ask it to "convert this into questions.md for the exam practice site".
   - It splits the questions into topics using the file's own section headings. If there aren't any, it groups questions by subject and names the topics.
   - Anything it isn't sure about, like a missing answer key, is marked with `<!-- CHECK: ... -->`. The checker lists those as warnings until you remove them.
2. Save the result as `exams/<exam-name>/questions.md`, for example `exams/final/questions.md`.
3. Push. Done.

If you drop a PDF, Word or Excel file into `exams/` by mistake, the build tells you it can't be read. GitHub also opens an issue reminding you to convert it.

### Option B: start from the template

```bash
npm run new-exam
```

It asks for the exam name, the time limit, and whether this is the exam students should see first. Then it creates `exams/<name>/questions.md` from the template. Replace the example questions with yours.

### Option C: by hand

Copy `exams/_template` to a new folder (without the underscore), rename it, and edit `questions.md`.

### Switching from Midterm 2 to the Final

In `exams/final/questions.md` set `active: true`. In `exams/midterm-2/questions.md` set `active: false` and `archived: true`.

Midterm 2 then moves to "Past exams", where students can still practice with it, and the Final becomes the main exam. Students' Midterm 2 progress is kept separately.

---

## 4. Question format

Each exam is one plain-text file. Edit it in any text editor, or directly on github.com (open the file, click the pencil).

```markdown
---
title: Midterm 2
course: BIOL 101 · Fall 2026     # optional
description: Covers chapters 5–8 # optional, shown on the home screen
active: true                     # the exam students see first
archived: false                  # true = listed under "Past exams"
time_limit: 75                   # minutes for the "Timed practice test"
pass_mark: 70                    # target score, in percent (optional)
exam_date: 2026-11-18            # optional, shows a countdown
---

# Topic: Recursion

## Q1 · single · easy · on-exam
What is the base case in a recursive factorial?
- [ ] n == 1 returns 0
- [x] n == 0 returns 1
- [ ] There is no base case
> Hint: What is 0! defined as?
> Explanation: 0! = 1, so the recursion stops at n == 0.
```

| Part | Meaning |
|---|---|
| `# Topic: Name` | Starts a topic. Every question below it belongs to that topic until the next `#` heading. |
| `## Q1 · …` | Starts a question. `Q1` is its ID: any letters/numbers, unique within the file. **Keep IDs stable** so students' progress carries over when you edit. |
| `single` `multi` `truefalse` `numeric` `text` | Question type. Optional: if left out it's guessed from the answers. |
| `easy` `medium` `hard` | Difficulty (default `medium`). |
| `on-exam` | Part of the "Timed practice test", in file order. Random practice tests copy the topic mix of these questions. If no question has it, the timed practice test uses every question. |
| `2pts` | Worth 2 points (default 1). |
| `- [ ]` / `- [x]` | Answer choices. `[x]` marks the correct one(s). |
| `= answer` | Answer for true/false, numeric and fill-in questions. |
| `> Hint:` | Optional hint (practice modes only, never in the timed tests). |
| `> Explanation:` | Shown after answering. More `>` lines continue it. |
| `<!-- CHECK: note -->` | A note to yourself. Shows as a warning until you delete it. |

### The five question types

```markdown
## Q2 · multi
Which are mutable in Python? (Select all that apply)
- [x] list
- [ ] tuple
- [x] dict

## Q3 · truefalse
A horizontal line has an undefined slope.
= false

## Q4 · numeric
What is the positive root of x² − 2x − 8 = 0?
= 4
```

Numeric answers can be written as `= 42`, `= 3.14 ± 0.01`, `= 200 ± 5%`, or a range `= 2..3`.

Students can type decimals, negatives, `1,000`, or fractions like `1/4`.

```markdown
## Q5 · text
The organelle where photosynthesis happens is the ____.
= chloroplast | chloroplasts
```

Fill-in answers aren't case sensitive. Separate accepted alternatives with `|`.

### What you can put in question text

- **Formatting:** `**bold**`, `*italic*`, `` `code` ``, lists, tables
- **Math:** `$x^2$` inline, `$$\sum_{k=1}^n k$$` on its own line
- **Code blocks** with syntax highlighting:
  ````markdown
  ```python
  print("hi")
  ```
  ````
- **Images:** put the file in the exam's `images/` folder and write `![short description](images/diagram.png)`

---

## 4b. Programming assignments

Put assignments in an `assignments` folder inside the exam folder. Each assignment is a folder whose name starts with a number (the order):

```
exams/CS150/Midterm 2/
  questions.md
  assignments/
    01-movie-ticket/
      assignment.md        ← title, settings and the instructions students read
      MovieTicket.java     ← starter code students begin with
      solution/
        MovieTicket.java   ← your reference solution (never published)
      tests/
        test1_adult_evening.in     ← input typed into the program
        test1_adult_evening.out    ← exact output expected
        ...
      checks.txt           ← optional code requirements
```

`assignment.md` starts with a few settings, then the instructions in Markdown:

```markdown
---
title: Movie Ticket Pricer
class: MovieTicket                 # the Java class name (and file name)
order: 1
difficulty: medium                 # easy | medium | hard
estimate: 30 min
topics: if / else-if chains, logical operators, printf
sample_tests: test1_adult_evening, test2_child_matinee   # tests students can see before running
---

Write a program that prices one movie ticket. ...

## Hints
- First hint (students reveal hints one at a time)
- Second hint
```

`checks.txt` (optional) lists requirements on the code itself, one per line: `require:<regex>  # label` or `forbid:<regex>  # label`. The label is what students see, for example `require:\bswitch\s*\(  # Uses a switch statement`. Comments are ignored when checking.

**How grading works:** the student's program is compiled and run in their browser against every test. Output must match the `.out` file exactly, except that spaces at the ends of lines and blank lines at the very end don't matter. Tests not listed in `sample_tests` are hidden until the student runs them. Programs that loop forever are stopped after 5 seconds.

**Your solution is checked on every publish.** If the reference solution in `solution/` doesn't pass all of its own tests and checks, the build fails and tells you which test, so a typo in a `.out` file never reaches students. The `solution/` folder is never copied to the website. Keep it in the repo (a private repo keeps it fully hidden; in a public repo anyone browsing GitHub can read it).

**What Java is supported:** the CS150-level language: `Scanner` input, `System.out.print/println/printf`, `String.format`, primitives, `String` methods, `Math`, `Integer/Double` parsing, arrays, `if`/`switch` (including `case ->`), all loops, `break`/`continue`, static methods and recursion, and runtime exceptions with Java's own messages. Not supported yet: your own classes with objects, `ArrayList`, interfaces and generics. If a starter or solution uses something unsupported, the build tells you.

---

### Extras for students

- **Try a similar question:** after a wrong answer in practice, one click adds another question from the same topic.
- **Coding helpers:** **Format** fixes indentation (only spaces change, never the code), suggestions pop up while typing on a computer (type `sout` then Tab for `System.out.println();`, `fori` for a for loop), and after **Run** with a sample input the output is compared with the expected output line by line.
- **Reading options** in Settings: an easier-reading font (Lexend, wider spacing) and a high-contrast theme.

---

## 4c. Timed exams (locked down, one attempt)

For real tests taken on the site. Needs student sign-in (section 7). On the class dashboard open the **Timed exams** tab (or **Timed exams** on the class page) and click **New timed exam**.

1. **The exam:** title and the instructions students read before starting.
2. **When:** opens, closes and the time limit. Students start any time in the window; each student's clock starts when they press Start and never runs past the closing time. Times use Firebase's clock, not the student's computer.
3. **Questions:** drop a question file (same format as practice exams) and/or a programming-problems zip or folder (same format as assignments). Points: `## Q3 · 2pts` in a question heading, `points: 15` in assignment.md (default 10). Written answers graded by hand: `## Q9 · written · 5pts`, with an optional `= model answer` line for the grader. In programming problems, the tests in `sample_tests` are shown to students; the others stay hidden and are used for grading. Reference solutions are run against the tests before publishing and are never uploaded.
4. **Rules:** shuffle questions and choices per student; require Safe Exam Browser; allow phones (off by default); show which questions were right when scores are released.
5. **Extra time:** one student per line, `jdoe@sdsu.edu 30`.

**What the site enforces:** one attempt (the database refuses a second); start, saves and submission checked against Firebase's clock (no saving after the time limit); one device (another device can't open or save the attempt); answers save every 2 minutes and on submit; the exam is submitted automatically when time runs out. Answer keys, hidden tests and solutions are stored where only staff can read them; students' computers never receive them.

**Lockdown:** full screen; switching tab, app or desktop, clicking outside the window, leaving full screen, closing or reloading the page, the screenshot key and developer-tools keys **end the exam immediately** (no warning) and are recorded. Copy, cut, paste, right-click, dragging, printing, Back and swipe-back are blocked. No hints, no answer checking, no code suggestions. The student's name is shown faintly across the screen. Phones and a connected second screen are refused unless allowed.

**What a web page can't block:** screenshots taken with the operating system's own tools, or a second device used beside the computer. For that, tick **Require Safe Exam Browser** (free for Windows, Mac and iPad from safeexambrowser.org): it locks the computer to the exam and blocks screenshots and other apps. Set its start address to the exam's student link (**Copy the student link** on the exam page) in the SEB configuration tool and give students the .seb file. Otherwise, run the exam in a lab or with a proctor.

**During the exam (Live tab):** counts of not started, working, submitted, ended by leaving and no contact; each student's status, start time, time left, last save, answered count, exits and device. **Let back in** (with extra minutes, the answers they saved are kept), **+ Time**, **End**, and a timeline of everything that happened for each student. Refreshes every minute.

**Afterwards (Results tab):** **Grade all attempts** marks choice, number and short answers against the key and runs every programming answer against all tests, hidden ones included (points in proportion to tests passed). Click a cell to see the answer and set points (needed for written answers; your points are kept if you grade again). **Release scores to students** shows each student their own score on their class page. **Download CSV** (for Canvas) and **Add to Exam scores** (for the analysis).

**Free-plan cost:** about one write every 2 minutes per student (a 90-minute exam for 200 students is about 9,500 writes and 20,000 reads, plus 200 reads a minute while the Live tab is open). Turn off Auto-refresh if several staff watch at once.

## 5. Checking and previewing on your computer (optional)

This needs [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install        # once
npm run dev        # preview at http://localhost:5173, rebuilds when you save
npm run check      # only check the question files
npm test           # run the self-tests
```

You can also check a file without installing anything. On the live site, click **"For instructors: check a question file"** at the bottom of any page and drop your `questions.md` there. It lists any problems with line numbers and lets you try the exam as a student. The file never leaves your computer.

---

## 6. Things to know

- **Progress and assignment code live in each browser.** Code is saved automatically as students type. Students who switch devices or clear their browser data lose it unless they use Export/Import in Settings. Private/incognito windows don't keep it after closing.
- **Question IDs matter.** If you rename `Q7` to `Q8`, students' history for that question is treated as a new question. Changing the wording or answers is fine.
- **The timed test timer** keeps counting across a page reload (time spent away from the tab is not counted). When it runs out, answers are submitted automatically.
- **No tracking, no analytics, no cookies.** The only outside request is loading the fonts from Google Fonts. To remove it, delete the two `fonts.googleapis.com` lines in `app/index.html`; the site falls back to system fonts.

---

## 7. Student sign-in and class rosters (optional)

With sign-in on:

- Only people on a **class roster** can use the site. They sign in with their school Google account (`@sdsu.edu` only; change `allowedEmailDomain` in `app/config.js` for another school), which for SDSU means the normal SDSUid login.
- After signing in, students land straight on their class (or a short list if they're in several). They only see the exams of their own classes. Someone not on any roster sees "You're not on a class roster yet."
- Each student's answers, scores, saved questions, notes and assignment code are saved to their account and appear on any device they sign in from. Signing out removes them from that browser, so shared lab computers are safe.
- **Instructors** (the class's Teachers and TAs from the roster, plus any emails you add) get a dashboard for their own classes only: who has started and who has never signed in, last active, questions tried, accuracy, quiz readiness, best real-exam score, assignments, weakest topics, each student's code, filters by section, and a CSV download.
- **Admins** (you) create classes and upload rosters on the **Admin** page.
- Rosters are stored in the Firebase database, never in this repo, and only admins and that class's instructors can read them. Students can only ever see their own data.

It runs on Google Firebase's free plan, which needs no credit card. The free plan allows 50,000 sign-ins a month, 1 GB of data, and 20,000 saves and 50,000 reads a day. Progress stays in the student's browser while they study and is saved to their account when they leave the site (close the tab, switch app or lock the device), after a quiz or assignment test run (at most every 10 minutes), from Settings → Save now, and every 30 minutes if the page stays open. It never sends data the account already has. Each save writes at most two records per exam: the student's progress (including their assignment code) and the dashboard summary (including the instructor's copy of the code). Each student's device may also write at most 60 records a day (`dailySaveLimit` in `app/config.js`); after that, progress stays on the device and is saved after midnight Pacific. 300 students × 60 = 18,000, inside the free 20,000 a day whatever happens. A class of a few hundred stays far inside the free limits, even the night before an exam. If a daily limit were ever reached, saving pauses until the next day (progress stays safe in the browser) and you are never charged.

### Setting it up (about 15 minutes, once)

1. Go to [console.firebase.google.com](https://console.firebase.google.com), sign in with a Google account, and click **Create a project**. Name it (for example `cramming`). You can turn Google Analytics off.
2. **Turn on Google sign-in:** in the left menu choose **Build → Authentication → Get started**. On the **Sign-in method** tab, click **Google**, switch it on, choose a support email and click **Save**.
3. **Allow your website address:** still in Authentication, open the **Settings** tab → **Authorized domains** → **Add domain**. Add `www.cramming.net` and `cramming.net`.
4. **Create the database:** **Build → Firestore Database → Create database**. Pick the **Standard** edition, a location near your students (for example `us-west2`), and **Start in production mode**.
5. **Set the security rules:** open `firestore.rules`, replace `your-email@sdsu.edu` in `admins()` with your own SDSU email (all lowercase; add other admins separated by commas), and change `sdsu[.]edu` if your school is different. In Firestore, open the **Rules** tab, delete what's there, paste the whole file and click **Publish**.
6. **Connect the website:** gear icon → **Project settings** → **Your apps** → web icon `</>` → nickname → **Register app** (no Firebase Hosting). Copy `apiKey`, `authDomain`, `projectId` and `appId` into the `firebase` section of `app/config.js`, then push.

The `apiKey` in `config.js` is meant to be public; it only identifies your Firebase project. The rules from step 5 are what protect the data.

### Exams and assignments on the site (no GitHub needed)

With sign-in on, exams and programming assignments are uploaded on the site, so instructors never need GitHub:

1. Open the class (or **Admin → Exams & assignments**, or the button on the class page or dashboard). Admins and the class's instructors and TAs can use it.
2. **Add an exam:** choose the exam's question file (`.md`, same format as section 4) or paste its text. It's checked right there, with line numbers for any problems; **Publish** is only possible once it's correct. Students in the class see it immediately.
3. **Add assignments:** choose a `.zip` with one folder per assignment (same layout as section 4b, including `solution/`). Every reference solution is run against its tests in the browser first; anything that fails is listed before you can publish. Solutions are stored for instructors only and are never sent to students.
4. **Replace questions**, download the `.md` or the assignments `.zip` (to edit and upload again), or delete an exam at any time.

You can drag the `.md` file, the `.zip`, or the assignments folder itself onto the page instead of choosing it.

Uploaded exams are only readable by people on the class roster, unlike files in a public GitHub repo.

**Safety:** questions, explanations and assignment instructions can use Markdown formatting (bold, code, tables, images and links to `https://` pages). Any HTML that could run code is removed before it's shown: scripts, `onerror=`-style attributes, `javascript:` links, iframes and forms. So an uploaded file can't do anything in students' browsers. Imported progress backups are checked the same way.

**Flaky internet:** once the site has loaded, every page and the class's questions are kept in the browser, so students can keep practising if the connection drops. Their progress is saved to their account when they're back online.

**Moving an exam from GitHub:** exams still in the `exams/` folder show on that page with **Move here**. Upload the same file there; it keeps the same exam, so students keep their progress. Then upload its assignments zip and delete the folder from GitHub. The site works with an empty `exams/` folder.

### Adding a class and its roster

1. Sign in on the site with your admin email and click **Admin → New class**.
2. **Class name:** for example `CS150 Fall 2026`. **Term:** `Fall 2026`.
3. Exams are optional here: after creating the class you land on its **Exams & assignments** page to upload them. (Exams still in the `exams/` folder can be ticked.)
4. **Roster:** in Canvas, open the course's **People** page, scroll to the bottom so everyone is loaded, select the whole table (from the "Name" heading to the last student), copy, and paste it into the box. A CSV file works too, such as a Gradebook export. The site reads the Name, Login ID (or Email), SIS ID (RedID), Section and Role columns. Teachers and TAs become instructors; observers are left out.
5. **Teaching staff:** Teachers and TAs found in the roster are listed automatically. For each person you can edit the name and email, set the role (**Instructor** or **TA**), and for TAs tick the sections they look after. A TA's dashboard shows only those sections (tick none to show them the whole class). Click **Add an instructor or TA** for anyone not in the Canvas roster.
6. Check the preview: the number of students, the emails (they must be the SDSU accounts students sign in with) and any skipped rows. Then click **Create class**.

**Changing TAs or their sections later:** open the class, click **Edit / new roster**, change the Teaching staff rows and click **Save changes**. You don't need to paste the roster again.

**Colour and exam dates:** each class has a colour (its pages use it, so students in several classes can tell them apart) and an optional date for each exam. Students then see "Midterm 2 in 5 days" on their class page. A date set here overrides any `exam_date` in the question file.

**Announcements:** instructors open **Dashboard → Announcements**, type a message (for example "Exam room changed to GMCS 333"), optionally choose "Show until", and click **Post**. It appears at the top of every student's class page until it expires or is deleted; students can dismiss it on their device.

**Question reports and most-missed questions:** students can flag a question they think is wrong or unclear (the flag icon on a question). Reports appear on the dashboard, where instructors mark them resolved. The dashboard also lists the questions most students currently get wrong, with a **View** button.

**Platform overview (admins):** **Admin** in the menu opens the overview of every class:
- totals: students on rosters, how many have signed in, active today / this week / last 30 days, quizzes finished, questions answered, assignments completed;
- a chart of students active each day for the last 30 days (also as a table);
- one row per class with sign-ins, weekly activity, average readiness and accuracy, assignments done, open reports and the next exam. Click a class to open its dashboard.

**Sections on the dashboard:** the tabs at the top (**All sections · CS-150-01 · …**, with student counts) filter the whole dashboard: totals, topics, most-missed questions, assignments, reports, the student list and the **CSV** download, whose file name includes the section. The choice is remembered while you move around. Under **All sections** a table compares the sections (students, not signed in, started, active this week, median readiness, accuracy, assignments done). Click a section there to open it. The student list can be grouped by section, and sorting by Section goes A→Z, then by name. TAs only see tabs for their own sections.

**The class dashboard (simple tabs):** pick the class and practice exam at the top, and a section if you want one. Five tabs:
- **Students:** boxes at the top count *Everyone, Practising, Signed in but not started, Never signed in, Not active this week* and *Readiness under 40*. Click a box to list only those students (click again to show everyone). The list shows each student's status, questions tried, accuracy, readiness, uploaded exam scores (e.g. Midterm 1 → Midterm 2) and assignments. **Download list** saves it as a CSV.
- **Class progress:** totals, the sections side by side, and assignment progress.
- **Topics & questions:** student question reports, the most-missed questions and the weakest topics.
- **Exam scores:** upload real exam scores and compare (the analysis described below).
- **Announcements:** post messages students see on their class page.

**Signed in:** a student counts as signed in as soon as they sign in to the site, even before they practise. Each student's first visit of the day leaves a small "signed in" record for each of their classes. Students who signed in before this update are picked up the first time the site admin opens that class's dashboard.

**Changing a student (admin):** open the student and click **Edit section or name**. Email and RedID come from the roster and can't be changed there. **Remove** takes the student off that class; their saved practice is kept, so adding them back restores it.

**One student in detail:** on the class dashboard, click a student's name (or double-click their row). A panel opens on the right with everything about them: their real exam scores (for example Midterm 1 and Midterm 2, with the points and the change between them), their practice on the chosen exam (questions tried and solved, accuracy, readiness, quizzes, timed tests), the days they studied in the last 4 weeks, their practice on every exam of the class, topics, the questions they keep getting wrong, and their assignments with **View code**. Use the arrows to go to the next or previous student, and Esc or × to close. Exam scores come from **Exam analytics**.

**Who has signed in:** the class dashboard shows each student as **Not signed in yet**, **Signed in · not started** (signed in but hasn't practised that exam) or their progress. If a student signs in with an SDSU account that isn't on any roster (often an email alias), they see "You're not on a class roster yet". Their account then appears on the Platform overview under **Signed in but not on any roster**: pick their class and click **Add**, and they can sign in straight away. (This needs the latest `firestore.rules` published.)

**Exam analytics (real exam scores):** **Dashboard → Exam scores** tab (or **Exam scores** on My classes). Click **Upload scores** and drop in a CSV, choose one, or paste cells copied from a spreadsheet:
- **From Canvas:** Grades → Export → Export Entire Gradebook. Upload it as it is: the site finds the email/SIS Login ID/RedID columns, reads the "Points Possible" row as the *out of*, skips the Test Student, and picks the exam column (change it in the drop-down). Any sheet with an Email or name column and a score column works too.
- Name the exam, check *Out of*, and under **Practice on this site for it** pick the site exam students practised (choose **None** for an exam from before the site, such as Midterm 1). The preview shows how many rows matched the roster, which didn't, and who has no score. **Replace** swaps in a corrected file; the bin deletes a set.
- **Analysis** compares students in four groups by their practice on the chosen site exam: **practised regularly** (50+ questions tried), **some practice** (1–49), **signed in, no practice**, and **never signed in**. It shows averages by group, each student's change from the earlier exam (the fairest comparison, since it compares students with themselves), a table of scores by **number of questions solved** (a question counts as solved once answered right at least once), a dot chart of questions solved or tried against score, a by-section table, and a sortable student list with a CSV download. Section tabs filter everything; TAs only see their sections.
- **Exams in parts (e.g. Midterm 1 MC + Midterm 1 FR):** if both parts are columns in the same file, tick both score columns (or click **Add them together** when the site spots them) and they're added into one exam, "out of" too. If the parts were uploaded separately, click **Combine parts**: tick the parts, check the name and click **Combine**. The separate parts are removed afterwards (untick that if you want to keep them). Students missing a part are left out unless you tick **Count a missing part as 0**.
- **One student:** click a name in the Students list (or use **Look at one student…**). It shows their score on each exam next to the class average and their section's average, their rank, their change between exams against the class's and section's change, and their practice (questions tried and solved, accuracy, quizzes, readiness, best timed test) against the medians. **Whole class** = the **All sections** tab; **one section** = its tab.
- Scores are stored in Firestore under the class and can be read only by that class's instructors, TAs and admins, never by students. Publish the latest `firestore.rules` before the first upload. Uploading reads nothing extra from students and costs one write per exam set.

**Manage classes** on that page goes to class and roster editing. Opening the overview reads about one record per student per exam, plus one per person who has signed in, and keeps the result for 10 minutes; **Refresh** reads it fresh. A student counts as active on a day they answered questions, finished a quiz or worked on an assignment. This comes from the progress they already save, so it costs no extra saves.

**Adds and drops:** open the class, click **Edit / new roster**, paste the current roster and save. The preview shows who is new and who will lose access. Students who are dropped keep their saved progress in case they're re-added.

**A new term:** create a new class (for example `CS150 Spring 2027`) with that term's exams and roster. Each class's dashboard only shows its own students.

**Turning sign-in off again:** empty the `apiKey` value in `app/config.js` and push. The site goes back to saving in each browser, open to everyone.

**Before collecting student data,** check your department's rules. Scores linked to student names are student records (FERPA in the US). The sign-in page tells students that their instructor can see their progress and code.
