# Changelog

One entry for every upload to the live site, newest first. Each entry says what changed for people and how it was tested. Uploads made before this file existed weren't recorded.

## Not yet uploaded

These changes are on the branch `fixes/usability-and-content`. They go live together after testing.

**The front door (17 November 2026)**
- New landing page at cramming.net for visitors who aren't signed in. It's written for professors and shows a working product demo, a practice question you can try, how it starts, privacy, and questions professors ask. Sign-in moved to `#/signin`.
- Motion: sections glide in as you scroll, the product tilts upright, cards drift, and a progress line runs under the header. One "Pause motion" button stops it all, and it's off for people who ask their device for reduced motion.
- **Request access** opens a panel over the page. Requests are saved in Firestore, and admins see them under Admin › Classes › Access requests, with a "Handled" button.
- Draft policy pages: Privacy, Terms of use, How we use AI, Accessibility. They need a lawyer's review before launch.
- **Tested:** browser checks at 1280×720, 1366×768, 1440×900 (dark), 1920×1080 and phone (light and dark). The hero and the top of the product fit on screen, nothing scrolls sideways, every section revealed, the sheet opened without moving the page, empty and real requests worked, and axe found no problems. Policy pages, sign-in, protected pages and the admin list were also checked.
- **To make it live:** also add `contactEmail` to your `app/config.js`, and publish the new `firestore.rules` (it adds `accessRequests`).

**For professors**
- Build my course: set up the course, upload materials, connect your own AI (Claude, ChatGPT or Gemini), approve the course map, watch the build, then review, edit and publish. Options: build in parts, three chats (builder, checker, fresh eyes).
- Switch study pages, My study and the tutor on or off for a class.
- Release dates for practice.

**For students**
- Study pages, one per unit, opening on the unit's first day.
- My study: today's short list, the mistake notebook, a week plan, and how ready you are.
- Ask the tutor: a link for your own AI that answers only from your professor's open units, and never during graded work.

**Behind it**
- A Cloudflare Worker for the builder and tutor connectors.
- Security rules for builds, study pages and tutor links.

**Tested:** 53 automated tests. Browser checks with axe ran against a local copy of the site, and a real Claude chat completed a full demo build. Not yet tried on real Firebase, with ChatGPT or Gemini, or on a full-size course.

**To make it live:** upload the project, wait for the green build, publish `firestore.rules`, paste `worker.js` into Cloudflare, add `connectorUrl` to `app/config.js`, and add the `SERVICE_ACCOUNT` secret in Cloudflare.
