# Moving to a new Firebase project, buying a domain, and launching

## 0. Do you actually need a new account?

Probably not. Firebase's free plan limits are **per project**, not per Google account (Firestore: 1 GiB stored, 50,000 reads/day, 20,000 writes/day, 20,000 deletes/day, 1 MiB max per document; resets at midnight Pacific). So the simplest way to get room for another project is:

**Option A (recommended): leave Home Hub exactly where it is and create a separate Firebase project for the new app.** Same Google account is fine. It gets its own fresh free quota. Nothing to migrate.

**Option B: move Home Hub to a different Firebase project/account** (for example a new account you want to own it long-term). Steps below.

### How much does Home Hub actually use?
Measured on a test copy (counts are billed documents):

| Open this app | Before this update | After |
|---|---|---|
| Gym (with 300 days of logs) | ~1,100 reads | ~60 |
| Diet (with 300 days of logs) | ~2,800 reads | ~46 |
| Hub first load | 24 | 24 |
| Hub refresh | 9 | 9 (+1 for water instead of 7) |

Before the update Gym and Diet re-read your whole history on every open, so the cost grew every day. At ~20 opens/day that would have reached the 50,000/day limit within about a year. Now they read the history once, keep it in the browser, and afterwards only fetch the last 14 days (full re-check once a week).

## 1. Move Home Hub to a new Firebase project (Option B)

All Firebase settings now live in **one file**: `assets/firebase-config.js`.

1. **Create the project.** console.firebase.google.com → Add project (turn Google Analytics off, it isn't needed).
2. **Add a Web app:** Project settings → Your apps → `</>` → register. Copy the `firebaseConfig` block.
3. **Authentication:** Build → Authentication → Get started → Sign-in method → turn on **Email/Password**. (You can add your user here, or let the tool in step 6 create it.)
4. **Firestore:** Build → Firestore Database → Create database → production mode → pick a region near you (pick carefully, it can't be changed later). Then Rules → paste this and Publish:
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
5. **Authorized domains:** Authentication → Settings → Authorized domains → add `bhargav-shivbhakta.github.io` (and later your own domain).
6. **Copy your data:** open `https://<your-site>/migrate.html`. Fill in the old account's email and password, paste the new config, press **Check** (writes nothing), then **Copy to new project**. It only reads the old project and never deletes anything, so the old project stays as your backup. Your user id changes between projects; the tool handles that.
7. **Switch the site:** put the new config into `assets/firebase-config.js`, upload that one file, and open the site in a private window to confirm everything is there.
8. **Clean up:** delete `migrate.html` from the repo once you're done. Keep the old project untouched for a few weeks, then delete it.

Notes: Firebase Auth sign-ins are per project, so everyone signs in again once. Photos and notes are stored inside your documents, so there is no separate file storage to move.

## 2. Buying a domain

- **Where:** Cloudflare Registrar (sells at wholesale cost, no markup) or Porkbun or Namecheap. A `.com` is roughly $10-12/year; check the renewal price (the price after year 1) before buying, and avoid ultra-cheap extensions with expensive renewals.
- **At checkout:** turn on auto-renew, free WHOIS privacy, and two-factor sign-in on the registrar account.
- **Point it at GitHub Pages:**
  1. GitHub repo → Settings → Pages → Custom domain → enter the domain → Save (do this **before** the DNS step; it adds a `CNAME` file to your repo).
  2. At the registrar's DNS settings add four **A** records for the bare domain: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; and a **CNAME** for `www` pointing to `bhargav-shivbhakta.github.io` (no repo name).
  3. Wait (up to 24 h), then tick **Enforce HTTPS** in Pages settings.
- **Then:** add the domain under Firebase Auth → Authorized domains. If you restrict your API key (below), add it there too.
- **Heads-up:** a new domain is a new "origin". Everyone has to sign in again once, and the phone home-screen app must be removed and added again from the new address. Do this before you tell other people to install it.

## 3. Before you call it launched: checklist

**Security**
- [ ] Firestore rules exactly as in step 4 above (no `allow ... if true`).
- [ ] Google Cloud Console → APIs & Services → Credentials → restrict the browser key to your domains (HTTP referrers) and to the Identity Toolkit, Firestore and Token Service APIs.
- [ ] Authentication: strong password for the shared login; consider disabling "sign-up" for strangers (Authentication → Settings → User actions → uncheck "Enable create (sign-up)") once your users exist.
- [ ] Delete `migrate.html` after migrating.
- [ ] The Gemini key you paste in Diet is stored in your private account data. It is only readable by you, but treat it like a password and rotate it if you ever paste it anywhere public.

**Data safety**
- [ ] **Diet stores everything in one document with a 1 MiB hard limit.** At about 10 logged meals/day (two people) it will stop saving in roughly 5-6 months. This needs an archive step (old months moved into their own documents) before launch. Until then, watch for the "Saved on this device; cloud retry needed" status in Diet.
- [ ] Take a manual backup: Gym → Backup/Export, and keep the old project after any move.
- [ ] Set a budget alert (Google Cloud Billing) even on the free plan, so you hear about surprises.

**Quality**
- [ ] Test on a real iPhone and an Android phone: sign-in, add to home screen, offline open, each app, rotate.
- [ ] Lighthouse (Chrome DevTools → Lighthouse): check PWA, accessibility, best practices.
- [ ] Add simple Privacy and Terms pages (a few paragraphs) if anyone beyond you two will use it.
- [ ] Decide what happens to `assets/banners/` (about 48 MB): GitHub Pages is fine up to 1 GB, but first load of banners should be lazy.
