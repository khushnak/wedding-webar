/* Renders still frames of the film without a browser, so you can check a beat
   without picking up your phone.

     npm i @napi-rs/canvas
     node tools/render_frames.js 0 2 4 6          # specific seconds
     node tools/render_frames.js --every 2        # every 2s of the whole film
     node tools/render_frames.js --scene paris    # one scene, 1s steps

   Frames land in tools/frames/.                                            */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'frames');

/* Pick up the real display font if it has been dropped into assets/fonts/. */
const fontDir = path.join(ROOT, 'assets', 'fonts');
if (fs.existsSync(fontDir)) {
  for (const f of fs.readdirSync(fontDir)) {
    if (/\.(ttf|otf|woff2?)$/i.test(f)) {
      try { GlobalFonts.registerFromPath(path.join(fontDir, f)); } catch (e) {}
    }
  }
}

const sandbox = { window: {}, console, Math, Date, performance: { now: () => Date.now() } };
vm.createContext(sandbox);
for (const f of ['js/config.js', 'js/engine.js', 'js/scenes.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const { CONFIG, E, SCENES } = sandbox.window;

(async () => {
  const args = process.argv.slice(2);
  const canvas = createCanvas(CONFIG.STAGE.w, CONFIG.STAGE.h);
  const stage = new E.Stage(canvas, CONFIG);

  const images = {};
  for (const [key, rel] of Object.entries(CONFIG.ASSETS)) {
    const p = path.join(ROOT, 'assets', rel);
    images[key] = fs.existsSync(p) ? await loadImage(p) : { width: 0, height: 0 };
    if (!fs.existsSync(p)) console.warn('missing', rel);
  }
  stage.setImages(images);

  let only = null, times = [];
  if (args.includes('--scene')) {
    only = args[args.indexOf('--scene') + 1];
    const s = SCENES.find(x => x.id === only);
    if (!s) throw new Error('no scene ' + only);
    for (let t = 0; t < s.dur; t += Number(args[args.indexOf('--step') + 1]) || 1) times.push(t);
  } else if (args.includes('--every')) {
    const step = Number(args[args.indexOf('--every') + 1]) || 2;
    const total = SCENES.reduce((a, s) => a + s.dur, 0);
    for (let t = 0; t < total; t += step) times.push(t);
  } else {
    times = args.map(Number).filter(n => !isNaN(n));
  }
  if (!times.length) times = [0];

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  for (const t of times) {
    stage.begin();
    let label;
    if (only) {
      SCENES.find(x => x.id === only).draw(stage, t);
      label = `${only}-${t.toFixed(1)}`;
    } else {
      let acc = 0;
      for (const s of SCENES) {
        if (t < acc + s.dur || s === SCENES[SCENES.length - 1]) {
          s.draw(stage, Math.min(t - acc, s.dur));
          label = `${String(Math.round(t)).padStart(3, '0')}-${s.id}-${(t - acc).toFixed(1)}`;
          break;
        }
        acc += s.dur;
      }
    }
    fs.writeFileSync(path.join(OUT, label + '.png'), canvas.toBuffer('image/png'));
  }
  console.log(`wrote ${times.length} frames to ${path.relpath || ''}${OUT}`);
})();
