# Fit Hub — what changed and how to finish setup

## New structure

```
/index.html         ← the hub: sign in, then pick a tile
/gym/index.html      ← Bhargav + Anusha's fitness tracker (unchanged, just moved)
/apps/grocery.html   ← the grocery tracker (now synced, not local-only)
/manifest.json, /sw.js, /icon-*.png  ← shared across the whole site
```

You sign in once on the hub page. Every other page checks that same sign-in
and sends you back to the hub if you're not signed in — no repeated logins.

## One required step: update Firestore rules (if not already exact match)

Firebase console → Firestore Database → Rules — make sure it's exactly:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

The `{document=**}` wildcard already covers any depth — Gym's per-profile data
*and* the grocery tracker's data both live under `users/{uid}/...`, so this
one rule protects everything. If you already have this exact rule from
before, there's nothing to change.

## Optional: turn on auto-discovery of new apps

Right now the hub always shows "Grocery Tracker" as a fallback tile, without
needing any configuration. If you want new pages you drop into `/apps/` to
appear **automatically** (no editing `index.html` at all), do this one-time
step:

1. Open `index.html` at the repo root.
2. Find this line near the top of the script:
   ```js
   const GITHUB_REPO = "YOUR_USERNAME/YOUR_REPO";
   ```
3. Replace it with your actual GitHub username and repo name, e.g.:
   ```js
   const GITHUB_REPO = "bhargav123/iron-log-site";
   ```
4. Save and redeploy.

Once that's set: **any `.html` file you upload into the `/apps/` folder in
the repo shows up as a new tile on the hub automatically** — no other code
changes needed. The tile's name is generated from the filename (`meal-planner.html`
→ "Meal Planner"). If the lookup ever fails (offline, GitHub API rate limit),
it silently falls back to showing Grocery Tracker only, so nothing breaks.

### Adding a new app later
1. Build or get an `.html` file for the new tool.
2. Make sure it checks Firebase auth the same way `apps/grocery.html` does
   (copy that pattern: initialize Firebase, `onAuthStateChanged`, redirect to
   `../index.html` if signed out) if it needs to save data privately.
3. Upload it into `/apps/` in the repo.
4. Refresh the hub — the new tile appears on its own (with GITHUB_REPO set),
   or ask me to add it to `FALLBACK_APPS` in `index.html` as a manual backup.

## Deploying

Same as before — upload the whole folder structure to your GitHub Pages repo
root, preserving the `/gym/` and `/apps/` subfolders. Wait ~1 minute, reload
your link.
