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

That's the whole format for a photo banner, which covers anything you
upload. (The built-in animated scenes — particles, chains, lightning,
and so on — are hand-coded per effect and aren't addable this way; ask
for a new one of those directly instead.)
