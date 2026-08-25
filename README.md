# AK Trading House — Company Profile Flipbook

Single-file, browser-based flipbook. Koi backend nahi, koi build step nahi, koi paid
plugin nahi. PDF browser me hi render hoti hai (PDF.js) aur page turn **canvas par
asli tarah mudta** hai — page ko 90 patliyon me tod kar, perspective camera ke saath
draw kiya jata hai, plus paper ki shading aur neeche parne wala shadow.

## Files

| File | Kaam |
|---|---|
| `index.html` | Poora flipbook reader — HTML, CSS, JS sab isi me |
| `AK-Trading-House-profile.pdf` | 20-page company profile |
| `cover.jpg` | WhatsApp / LinkedIn par link share karne ka preview image |

## Live karne ka tareeqa

1. Teenon files GitHub repo me upload karein
2. **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**
3. 1–2 minute baad link mil jayega: `https://shouaibk.github.io/flipbook-3d/`

`og:image` / `og:url` / `canonical` isi URL par set hain. Repo ya username badle to
`<head>` me teenon update karna zaroori hai, warna link preview blank aayega.

## Settings

`index.html` ke top par `CONFIG` block hai:

```js
const CONFIG = {
  pdf: "AK-Trading-House-profile.pdf",
  title: "AK Trading House — Company Profile",
  soundOn: true,
  showDownload: true,
  startPage: 1,
  flexibility: 0.9,   // page kitna mudta hai — 0 = bilkul flat, 1.2 = bohot
  flipMs: 800         // ek page turn ka time
};
```

Colors `:root` ke CSS variables me hain — `--accent` badalne se poora accent color
badal jayega, `--page` se background.

## Controls

- `←` `→` ya page ke us side par click — page turn
- Swipe — mobile par
- Bahar wale bade chevrons — prev / next
- Neeche wala toolbar — page counter, all pages, zoom in/out, fullscreen, share, aur `⋯`
- `⋯` menu — Download PDF, Single/Two pages, First/Last page, Sound
- `#p=7` URL me — kisi bhi page ka direct link (number wahi rehta hai jo share kiya tha)
- Zoom view me `+` / `−` aur `←` `→`

## PDF engine

pdf.js **4.10.38** (ESM, jsDelivr se). Wo na chale to 3.11.174 par fallback, aur wo
bhi na chale to file-picker screen. Untrusted PDF ke liye `isEvalSupported:false`.

## Local test

```bash
python3 -m http.server 8000
```

Phir `http://localhost:8000/` kholein. Seedha double-click se na kholein — browsers
`file://` par PDF load block karte hain.

## Kisi aur website me embed karna ho

```html
<iframe src="https://shouaibk.github.io/flipbook-3d/"
        width="100%" height="700" style="border:0" allowfullscreen></iframe>
```
