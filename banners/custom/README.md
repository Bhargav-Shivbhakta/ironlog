# Custom Today banners

Drop a `.json` file in this folder to add a new banner to your Settings →
Banner gallery. No code changes, no re-sending the app — just push the
file to GitHub and reload the Hub. It's picked up the same way the Hub
already discovers everything in `apps/`.

## Steps

1. Pick an image (a photo, or a transparent cutout like a car PNG) and
   add it to this folder too — e.g. `banners/custom/my-banner.jpg`.
   (A direct link to an image hosted elsewhere also works — see `image`
   below — but a file in this folder is simplest and never goes down.)
2. Copy the template below into a new file, e.g.
   `banners/custom/my-banner.json`.
3. Fill in the fields (see table below).
4. Push both files to the repo. Next time either of you opens the Hub,
   it'll show up in Settings → Banner under a "Custom" tag, scoped to
   whichever `profile` you set.

## Template

```json
{
  "id": "b-my-banner",
  "profile": "Bhargav",
  "title": "My Banner",
  "category": "Custom",
  "image": "banners/custom/my-banner.jpg",
  "objectPosition": "center 55%",
  "accent": "#ad7b20",
  "accent2": "#d2a84f",
  "bg": "#111210",
  "bg2": "#090a09"
}
```

## Fields

| Field | Required | What it does |
|---|---|---|
| `id` | yes | Unique id. Prefix with `b-` for Bhargav or `a-` for Anusha to keep it readable, but any unique string works. |
| `profile` | yes | Exactly `"Bhargav"` or `"Anusha"` — which of you sees it. |
| `title` | yes | Shown on the banner and in the gallery. |
| `image` | yes (for a photo banner) | Path to the image — either a file in this same folder (`banners/custom/whatever.jpg`) or a full `https://` URL to an image hosted elsewhere. |
| `objectPosition` | no | CSS `object-position` for cropping, e.g. `"center 60%"` to favor the lower half of a tall photo. Defaults to `"center 55%"`. |
| `category` | no | Small label under the title in the gallery. Defaults to `"Custom"`. |
| `accent` / `accent2` | no | Two hex colors — the eyebrow text, live-dot, and a light sweep across the photo use these. Pick something that matches the photo. Defaults to the gold used elsewhere. |
| `bg` / `bg2` | no | Banner's base background color, visible briefly before the photo loads. Defaults to near-black. |

That's the whole format for a flat photo banner — a full-bleed image with
a light sweep across it. It covers any ordinary photo. (The built-in
animated scenes — particles, chains, lightning, and so on — are
hand-coded per effect and aren't addable this way; ask for a new one of
those directly instead.)

## Option 2 — a cutout banner (the "mafia pack" style)

If your image is a **transparent-background cutout** (a car, a vault, a
briefcase — subject isolated on transparency, like the mafia-pack PNGs),
use `"scene": "subject"` instead of leaving `scene` unset. This is the
richer, more premium-feeling animation: the subject flies/slides in from
an edge with depth (3D tilt + scale), a soft glow pulses behind it, and —
for the "left"/"right" directions — a motion trail and speed particles
sweep past it. It's the exact system behind the current Bhargav banners.

```json
{
  "id": "b-my-cutout",
  "profile": "Bhargav",
  "title": "My Cutout Banner",
  "category": "Custom",
  "scene": "subject",
  "carImg": "banners/custom/my-cutout.png",
  "direction": "left",
  "motion": "cinematic",
  "mood": "Built, not given.",
  "accent": "#c9a227",
  "accent2": "#eede9a",
  "bg": "radial-gradient(circle at 77% 48%,#ad7b202b,transparent 31%),linear-gradient(120deg,#111210,#15130e)",
  "bg2": "#050504"
}
```

Extra fields only `scene:"subject"` uses:

| Field | Required | What it does |
|---|---|---|
| `scene` | yes | Must be the literal string `"subject"`. |
| `carImg` | yes | Path to the cutout PNG (transparent background), same rules as `image` above. |
| `direction` | no | Which way the subject enters from: `left`, `right`, `toward`, `bottom`, `diagonal-left`, or `diagonal-right`. Defaults to `left`. |
| `motion` | no | Entrance pacing: `cinematic` (default, ~2.15s), `energetic` (faster, ~1.35s), `subtle` (~2.8s), or `calm` (slowest, ~3.35s). |
| `mood` | no | A short line shown at the bottom-right of the banner (e.g. a quote or tagline). Omit for none. |
| `bg` / `bg2` | no | Same as the flat-photo format, but for this style it's worth pasting a two-layer `radial-gradient(...), linear-gradient(...)` string (see example) so the backdrop has the same atmospheric glow as the rest of the pack, instead of a flat color. |

`accent`, `accent2`, `objectPosition`, and `category` all work the same
as in Option 1.

## Which one should I use?

- A normal photo (a landscape, a room, a posed shot) → **Option 1**, plain `photo`.
- A transparent cutout like the mafia-pack images → **Option 2**, `subject` — it'll look and move exactly like the existing banners instead of just fading/sweeping in flat.
