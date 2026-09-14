# Rahul &amp; Arya — a wedding invitation that comes alive

Point a phone at the printed card and a 90-second 2D film rises out of it: how
they met, how they lost each other, how France gave them back, and when to
show up in February.

Browser-based. No app, no install, no tapping.

---

## Run it in two minutes

```bash
cd wedding-webar
python3 tools/serve.py
```

Then:

- **On your phone** — open the `https://192.168.x.x:8443/` address the script
  prints, accept the certificate warning, allow the camera, and point it at
  `assets/marker/print-hiro-a4.png` (print it, or just show it on a laptop
  screen). The film starts by itself.
- **On your laptop** — open `https://localhost:8443/?preview=1` to watch the
  whole thing full screen with no camera at all. This is how you should do
  most of your work.

The certificate warning is normal and only applies to this local test server.
Phone browsers refuse camera access over plain `http://`, which is the single
most common reason a WebAR demo "doesn't work".

---

## Why it is built this way

Four days, one student, a phone camera, and artwork that must not be
redrawn. That ruled a few things out and one thing in.

**AR.js gives the anchor. A single canvas gives the film.**

The card is tracked by AR.js. Anchored to it is exactly one flat plane,
standing upright so the content rises vertically out of the card and faces the
reader. Onto that plane is mapped one transparent `<canvas>` where the entire
2D film is drawn.

That choice buys four things that matter here:

- **It stays 2D.** No 3D engine, no lighting, no models. One textured quad.
- **Nothing looks like a slideshow.** The canvas is transparent, so characters,
  typography and props float in the AR space instead of sitting inside a
  rectangular panel — which is what happens if you anchor image planes or a
  flat backdrop.
- **One draw call.** Dozens of separate `<a-image>` entities would mean z-sort
  fights and a real frame-rate cost on a mid-range Android. A single texture
  upload, capped at 30fps, is cheap and predictable.
- **It is ordinary canvas code.** No build step, no bundler, no GSAP. Three
  script tags. You can read the whole animation layer in one sitting and fix
  it the night before the deadline.

**The timeline is deterministic.** Every scene is a pure function of time:
`draw(stage, t)` gives the same frame for the same `t`, always. That is what
makes "restart the moment the card is found" a one-liner, lets you jump to any
second with `?t=42`, and — most usefully — lets a Node script render frames of
the film without a browser so you can check a beat without picking up your
phone.

**Authoring happens in a fixed 1000×1500 space** that is scaled to the
texture, so nothing in the scene code depends on device resolution or on the
texture size you pick.

---

## The controls you will actually use

| URL | What it does |
| --- | --- |
| `?preview=1` | Full-screen, no camera. Use this for 90% of your work. |
| `?scene=paris` | Loop one scene. Names are in `js/config.js` → `SCENE_SECONDS`. |
| `?t=42` | Start the film 42 seconds in. |
| `?debug=1` | Scene name + timecode on screen, AR.js debug panel on. |

They combine: `?preview=1&scene=celebrations&debug=1`.

---

## Changing the content

Everything you are likely to change lives in **`js/config.js`**.

**Wedding details** — `EVENTS`. Three blocks, each with `name`, `venue`,
`date`, `time`. The three information lines render large / medium / medium in
that order. Adding a fourth event works: the section splits its time evenly and
you add a matching entry to `CAST.celebrations`.

**Timing** — `SCENE_SECONDS`. Every scene's length in seconds. Change one
number and everything downstream shifts; nothing depends on absolute time. The
whole film is currently 94 seconds. If that feels long for someone holding a
card at arm's length, trimming `meetRahul`, `meetArya` and `paris` by 2s each
is the painless 6 seconds.

**The font** — `FONTS`. Three roles: `display` (the big words), `script` (the
lowercase handwriting lines), `body` (venue and date). When your display font
arrives:

1. drop the file in `assets/fonts/`,
2. uncomment the `@font-face` block at the top of `css/style.css` and point it
   at your file,
3. change `FONTS.display` to `"800 {size}px 'Invite Display', sans-serif"`.

Keep the `{size}px` token — it is substituted per call. Nothing else needs to
change, and `tools/render_frames.js` picks the font up automatically too.

Right now the film loads Baloo 2 and Caveat from Google Fonts via the `<link>`
in `index.html`. Delete those two lines once you have your own file, so the
experience works with no network.

**Colours** — `PALETTE`. Sampled from the character artwork, so anything new
drawn with them stays in the family.

**Artwork** — `ASSETS` maps a name to a file under `assets/`. Replace a file,
keep the name, and every scene that used it updates. `CAST` decides which pose
appears where, and which interests circle each character.

---

## The artwork

`tools/extract_assets.py` cut everything out of your reference sheets. It
crops, keys out the flat cream paper, drops the small decorative accent dashes,
trims to the art, and resizes. It never restyles anything.

```bash
python3 tools/extract_assets.py --src /path/to/your/reference/sheets
```

What it produced:

- `assets/icons/` — 16 supporting illustrations: flowers, butterflies, chai,
  food, phones, airplane, suitcases, France flag, Eiffel, Louvre, Seine, ring,
  sparkle, college, road, airport.
- `assets/characters/` — Rahul and Arya in casual dress with the yellow halo
  disc removed; seven of Rahul's sherwani poses including the turban and the
  fist-up celebration; all five of Arya's bridal poses; the navy couple and
  the tux-and-blush couple.
- `assets/reference/` — see the note below.

**One thing needs your hands.** The two painted stage references (the navy
dancing pair, the candle-lit reception pair) have illustrated backgrounds
rather than flat ones, so no script can key them cleanly. They are copied to
`assets/reference/` uncut. The sangeet beat currently uses the navy dip-pose
cutout instead, which is the right outfit family. If you want the exact dancing
pose, cut it by hand in [Photopea](https://www.photopea.com) (free, in-browser:
magic wand the background, refine the edge, export PNG), save it as
`assets/characters/couple_sangeet.png`, and the film picks it up with no code
change.

**Adding poses.** Scenes 1–6 use one casual pose per character and get their
life from movement, tilts, scale pops and graphic accents rather than from
frame-by-frame drawing — which is the animatic language you asked for. If you
later draw two or three more casual poses (surprised, laughing, waving), add
them to `ASSETS` and swap the sprite key inside the relevant beat in
`js/scenes.js`. The airport meeting in scene 6 is the place where it would pay
off most; look for the `surprise` / `smile` / `laugh` envelopes.

---

## Using your own card as the marker

The project ships working with the standard **Hiro** marker so you can test
today: `assets/marker/print-hiro-a4.png`.

When you want the real invitation to be the trigger:

```bash
python3 tools/make_marker_sheet.py path/to/card-front.png
```

That wraps your artwork in the thick black border AR.js needs and writes a
print sheet. Then:

1. Upload `assets/marker/invite-marker.png` to the
   [AR.js marker generator](https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html).
2. Download the `.patt` file and save it as `assets/marker/invite.patt`.
3. In `js/config.js` set `MARKER.type` to `'pattern'`.
4. Print `assets/marker/print-invite-a4.png` at 100% scale.

What tracks well: bold, asymmetric, high-contrast shapes — a monogram, heavy
lettering, a strong ornament. What tracks badly: faces, fine linework, pale
washes, and anything symmetrical (a symmetrical marker flips orientation
unpredictably).

`MARKER.height` and `MARKER.scale` control how far above the card the film
floats and how large it is, in card widths.

---

## Deploying

It is a folder of static files, so anything works:

- **GitHub Pages** — push the folder, enable Pages on the branch. HTTPS is
  automatic, which is all the camera needs.
- **Netlify** — drag the folder onto the dashboard.

Guests need the URL and the card. A short link or QR code printed alongside the
invitation is the usual move — and a QR code, unlike the marker, can be small
and ugly without hurting anything.

---

## Checking your work without a phone

```bash
npm i @napi-rs/canvas
node tools/render_frames.js --every 3      # contact sheet of the whole film
node tools/render_frames.js --scene paris --step 1
node tools/render_frames.js 12 34.5 66
```

Frames land in `tools/frames/`. This is genuinely faster than reaching for
the phone every time you nudge a number, and it is how the layout collisions in
this build were found and fixed.

---

## Files

```
index.html               AR scene container, loader, fallback UI
css/style.css            overlay chrome and preview-mode layout, @font-face slot
js/config.js             ALL content, timing, fonts, colours, assets, marker
js/engine.js             timing helpers + drawing primitives (sprites, type,
                         badges, hearts, bursts, dashed trails, wipes)
js/scenes.js             the storyboard — one function per scene, in order
js/main.js               asset loading, AR.js wiring, playback director
assets/characters/       cut-out people
assets/icons/            cut-out supporting illustrations
assets/marker/           Hiro marker + print sheet
assets/reference/        the two stage references that need hand-cutting
tools/extract_assets.py  sheets → transparent PNGs
tools/make_marker_sheet.py  artwork → trainable marker + print sheet
tools/render_frames.js   headless frame renderer
tools/serve.py           local HTTPS server for phone testing
```

## If something goes wrong

**Black screen on the phone.** You are on `http://`. Use `tools/serve.py` or
deploy to HTTPS.

**Camera allowed but nothing tracks.** Fill roughly half the frame with the
marker, keep it flat, avoid glare from overhead lights, and make sure the whole
black border is visible. Add `?debug=1` to see what AR.js sees.

**The film plays but stutters.** Lower `STAGE.fpsCap` to 24, or drop
`STAGE.w` / `STAGE.h` to 512×768. The texture upload is the only real cost.

**An asset is missing.** Open the console — the loader names any file it could
not fetch, and the film keeps playing without it.
