# AK Trading House — Company Profile Flipbook

Ek single-file, browser-based flipbook reader. Koi backend nahi, koi build step nahi,
koi paid library nahi. PDF browser me hi render hoti hai (PDF.js) aur page turn CSS 3D se hota hai.

## Files

| File | Kaam |
|---|---|
| `index.html` | Poora flipbook reader — HTML, CSS, JS sab isi me |
| `AK-Trading-House-profile.pdf` | 20-page company profile (9.8 MB) |
| `cover.jpg` | WhatsApp / LinkedIn par link share karne ka preview image |

## Live karne ka tareeqa

1. In teenon files ko GitHub repo me upload karein
2. **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**
3. 1–2 minute baad link mil jayega: `https://USERNAME.github.io/REPO/`

`og:image` / `og:url` ab `https://shouaibk.github.io/flipbook-3d/` par set hain.
Repo ya username badle to `<head>` me yeh dono (aur `canonical`) update karna zaroori hai,
warna WhatsApp/LinkedIn par link preview blank aayega.

## Local test

```bash
python3 -m http.server 8000
```

Phir `http://localhost:8000/` kholein.
Seedha double-click se na kholein — browsers `file://` par PDF load block karte hain.

## Settings

`index.html` ke top par `CONFIG` block hai:

```js
const CONFIG = {
  pdf: "AK-Trading-House-profile.pdf",
  title: "AK Trading House — Company Profile",
  soundOn: true,        // page turn ki awaaz
  showDownload: true,   // toolbar me download button
  startPage: 1
};
```

Colors `:root` ke CSS variables me hain — `--brass` badalne se poora accent color badal jayega.

## PDF engine

pdf.js **4.10.38** (ESM, jsDelivr se). Agar wo load na ho to 3.11.174 par fallback
hota hai, aur wo bhi na chale to file-picker screen aa jati hai. Untrusted PDF ke liye
`isEvalSupported:false` set hai.

## Controls

- `←` `→` ya page ke kinaron par click — page turn
- Swipe — mobile par
- Toolbar — contents, all pages, zoom, sound, download, fullscreen
- `#p=7` URL me — kisi bhi page ka direct link (number wahi rehta hai jo share kiya tha)
- Zoom view me `+` / `-` — zoom in/out

## Kisi aur website me embed karna ho

```html
<iframe src="https://USERNAME.github.io/REPO/"
        width="100%" height="700" style="border:0" allowfullscreen></iframe>
```
