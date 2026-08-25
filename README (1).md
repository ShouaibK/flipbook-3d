# AK Trading House — Company Profile Flipbook

Single-file 3D flipbook. Page **asli tarah mudta hai** — WebGL mesh par, bilkul dFlip
jaisa. Kone par mouse le jaayein to page peel hota hai, kona pakad kar kheench sakte
hain, aur chhod dein to ya turn complete hoga ya wapas gir jayega.

- **pdf.js 4.10.38** — PDF ke pages render karta hai
- **three.js 0.169** — page ko mod kar 3D me dikhata hai
- Dono CDN se aate hain. Repo me sirf `index.html`, PDF aur `cover.jpg` hain.

## Files

| File | Kaam |
|---|---|
| `index.html` | Poora reader — HTML, CSS, JS sab isi me |
| `AK-Trading-House-profile.pdf` | 20-page company profile |
| `cover.jpg` | WhatsApp / LinkedIn preview image |

## Vercel par deploy

1. Teenon files ek GitHub repo me daal dein
2. Vercel → **Add New → Project** → repo import karein
3. Framework Preset: **Other**, Build Command khali chhor dein,
   Output Directory bhi khali (root se static serve hoga)
4. Deploy

Deploy ke **turant baad** `index.html` ke `<head>` me teen URL apne Vercel domain se
badal dein — `og:image`, `og:url` aur `canonical`. Abhi wo GitHub Pages ki taraf
ishara kar rahe hain, aur galat rehne par link preview blank aayega:

```html
<meta property="og:image" content="https://APNA-DOMAIN.vercel.app/cover.jpg">
<meta property="og:url"   content="https://APNA-DOMAIN.vercel.app/">
<link rel="canonical"     href="https://APNA-DOMAIN.vercel.app/">
```

GitHub Pages bhi chalta hai — Settings → Pages → main → / (root).

## Settings

`index.html` ke top par `CONFIG` block hai:

```js
const CONFIG = {
  pdf: "AK-Trading-House-profile.pdf",
  title: "AK Trading House — Company Profile",
  soundOn: true,
  showDownload: true,
  startPage: 1,
  flipMs: 620,        // ek page turn ka time — chhota = tez
  flexibility: 0.9,   // page kitna mudta hai (0 = flat board, 1.4 = bohot)
  peel: 1.0,          // hover par kona kitna uthe (0 = band, 1.6 = zyada)
  peelSpan: 0.45,     // page ka kitna hissa peel me shaamil ho (0.3 = sirf kona)
  peelCurl: 2.6,      // kona kitna tight roll kare
  portraitRotate: 1,  // phone portrait me book 90° ghumao (doosri taraf: -1, band: 0)
  shadows: true,      // uthe hue page ka shadow neeche wale pages par
  thickness: true     // book ki motai (page stack)
};
```

Colors `:root` ke CSS variables me — `--accent` se poora accent color, `--page` se
background.

Slow device par app **khud quality kam kar deta hai**: pehle shadows band, phir
resolution — taake flip smooth rahe.

## Mobile

Phone **portrait** me A4 ka poora spread parhne layak size me aa hi nahi sakta, is liye
book khud **90° ghoom jati hai** — dono pages nazar aate hain, toolbar seedha rehta hai.
Phone ko landscape me ghumate hi book apne aap seedhi ho jati hai (aur landscape me
header chhup jata hai taake book ko poori height mile). Rotation band karna ho to
`CONFIG.portraitRotate: 0` — phir portrait me ek page dikhega.

Ghumi hui haalat me controls bhi saath ghoomte hain: **upar swipe = agla page**,
neeche = pichla, aur chevrons upar/neeche aa jate hain.

## Controls

- `←` `→` — page turn · `Home` / `End` — pehla / aakhri page
- Page ke us side par click — us taraf turn
- **Kone par mouse** — page peel · **kona pakad kar kheenchein** — khud turn karein
  (aadhe se zyada kheencha to complete, warna wapas)
- Swipe — mobile par (ghumi hui book me upar/neeche)
- Neeche toolbar — page counter, all pages, zoom in/out, fullscreen, share, `⋯`
- `⋯` menu — Download PDF, Single/Two pages, First/Last page, Sound
- `#p=7` URL me — kisi bhi page ka direct link

## Agar WebGL na chale

Purane device ya blocked WebGL par app **flat mode** me chala jata hai — pages
normal images ki tarah, animation ke baghair, baaki sab kaam karta hai. three.js
load na ho to bhi yehi hota hai.

## Debug

Browser console me `__fbdbg.S` se poori state dekhi ja sakti hai (page, angle,
peel/drag state) — tuning ke liye kaam ki cheez hai.

## Local test

```bash
python3 -m http.server 8000
```

`http://localhost:8000/` kholein. Seedha double-click se na kholein — browsers
`file://` par PDF load block karte hain.

## Embed

```html
<iframe src="https://APNA-DOMAIN.vercel.app/"
        width="100%" height="700" style="border:0" allowfullscreen></iframe>
```
