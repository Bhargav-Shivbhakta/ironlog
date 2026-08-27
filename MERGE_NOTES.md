# Fit Log — merged app notes

This replaces your separate Iron Log and Glow Log deployments with one app:
sign in once, then pick a profile (Bhargav or Anusha), Netflix-style. Each
profile's data stays completely separate — Anusha never sees Bhargav's log
and vice versa.

## Good news: reuses your existing Firebase project

This app's `FIREBASE_CONFIG` is already filled in with your `iron-log-bfc55`
project — the same one you already set up Authentication and Firestore for.
You don't need to create a new Firebase project or redo that setup.

## One required step: update your Firestore security rules

The merged app stores data one level deeper (under a `profiles` sub-collection
per person), so the old rules need a small update. In the Firebase console →
Firestore Database → Rules, replace what's there with:

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

(This is actually the same rule as before — `{document=**}` already matches
any depth, including the new `profiles/{profileId}/...` path — so if you
already published this exact rule, you don't need to change anything. Just
double-check it matches what's above.)

## Deploying

Same as before: upload this folder's contents (`index.html`, `manifest.json`,
`sw.js`, `icon-192.png`, `icon-512.png`) to your GitHub Pages repo, replacing
the old files. Wait ~1 minute for Pages to rebuild, then open the link.

## Using it

1. Sign in with the same email + password you already created.
2. You'll land on a "Who's training?" screen — tap Bhargav or Anusha.
3. Everything works exactly as before inside that profile — Lift, Diet,
   Analytics, all of it — just themed to that person (Iron Log's dark red/brass
   look for Bhargav, Glow Log's rose/sage look for Anusha).
4. Tap "Switch profile" in the top-right any time to jump to the other person
   without signing out.

## Note on old data

If you had already logged real entries under the old separate Iron Log
deployment before this merge, they were stored at a different path and won't
automatically appear here (this only matters if you'd started logging before
today — if you were still finishing Firebase setup, there's nothing to
migrate). Let me know if that's the case and I can help move it over.
