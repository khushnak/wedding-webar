/* ==========================================================================
   ENGINE — timing helpers + drawing primitives.

   Everything is deterministic: give the same time in, get the same frame out.
   That is what lets the film restart cleanly whenever the card is found, and
   lets you scrub with ?t=42 while you are building.
   ========================================================================== */

const E = (() => {

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ------------------------------------------------------------- easings */
  const ease = {
    lin: t => t,
    out: t => 1 - Math.pow(1 - t, 3),
    out5: t => 1 - Math.pow(1 - t, 5),
    in: t => t * t * t,
    inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    /* overshoot — the "cutout snaps into place" feel */
    back: t => {
      const c = 2.0;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
    bounceOut: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
      return n * (t -= 2.625 / d) * t + .984375;
    },
  };

  /* Progress of a segment: 0 before t0, 1 after t0+dur. */
  const p = (t, t0, dur, fn = ease.out) => fn(clamp((t - t0) / dur));
  /* Raw, un-eased. */
  const pl = (t, t0, dur) => clamp((t - t0) / dur);
  const on = (t, a, b) => t >= a && t < b;

  /* Scale envelope for something that pops in, holds, then pops out.
     Returns 0..1; multiply into scale and/or alpha. */
  const life = (t, t0, dur, inD = .38, outD = .28) => {
    if (t < t0 || t > t0 + dur) return 0;
    const a = p(t, t0, inD, ease.back);
    const b = 1 - p(t, t0 + dur - outD, outD, ease.in);
    return clamp(Math.min(a, b));
  };

  /* Quantise time so movement lands on frames like a hand-made animatic. */
  const q = (t, fps) => (fps ? Math.floor(t * fps) / fps : t);

  /* Evenly spaced little hops between two x positions.
     Returns { x, lift, i, land } — land is 0..1 within the current hop. */
  const hops = (t, t0, from, to, n, stepDur) => {
    const k = clamp((t - t0) / (n * stepDur));
    const raw = k * n;
    const i = Math.min(n - 1, Math.floor(raw));
    const f = clamp(raw - i);
    const move = ease.out(clamp(f / .62));           // move fast, then hold
    const x = lerp(from + (to - from) * (i / n), from + (to - from) * ((i + 1) / n), move);
    const lift = Math.sin(Math.PI * clamp(f / .62)) * 1;
    return { x, lift, i, land: f, done: k >= 1 };
  };

  const bob = (t, speed = 1, amp = 1, phase = 0) =>
    Math.sin((t * speed + phase) * Math.PI * 2) * amp;

  /* --------------------------------------------------------------- stage */
  /* key -> panel name, built once per config (see CONFIG.LAYERS). */
  function layerMap(cfg) {
    if (cfg._layerMap) return cfg._layerMap;
    const m = {};
    const keys = (cfg.LAYERS && cfg.LAYERS.keys) || {};
    for (const name of Object.keys(keys)) {
      for (const k of keys[name]) m[k] = name;
    }
    return (cfg._layerMap = m);
  }

  class Stage {
    /* `layer` names which diorama panel this instance paints. null means a
       composite stage that paints everything onto one canvas, which is what
       ?preview=1 uses and what this class did before layering existed. The
       whole scene file is run once per panel; each pass owns its own canvas
       and context, so camera translates, save/restore and world-space
       tiling all behave exactly as they always have — the pass simply skips
       the artwork that belongs to a different panel. */
    constructor(canvas, cfg, layer = null) {
      this.cv = canvas;
      this.cfg = cfg;
      this.layer = layer;
      this.map = layerMap(cfg);
      this.dirty = false;
      this.W = cfg.STAGE.logicalW;
      this.H = cfg.STAGE.logicalH;
      this.C = cfg.PALETTE;
      canvas.width = cfg.STAGE.w;
      canvas.height = cfg.STAGE.h;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.k = cfg.STAGE.w / this.W;     // logical -> device
      this.images = {};
    }

    /* Which panel a piece of artwork stands on. */
    layerOf(key) { return this.map[key] || 'characters'; }
    /* True when this pass paints `name`'s content. scenes.js calls this to
       gate the few places it draws straight to the 2D context. */
    on(name) { return this.layer === null || this.layer === name; }
    /* True when this pass paints this artwork. */
    wants(key) { return this.on(this.layerOf(key)); }

    setImages(map) { this.images = map; }
    img(key) { return this.images[key]; }

    begin() {
      this.dirty = false;
      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      c.setTransform(this.k, 0, 0, this.k, 0, 0);
      c.lineJoin = 'round';
      c.lineCap = 'round';
      /* PNGs (character art especially) get drawn well below their native
         resolution — 'high' avoids the extra softness the default 'low'
         quality adds on top of that necessary downscale. */
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
    }

    save() { this.ctx.save(); }
    restore() { this.ctx.restore(); }

    /* ------------------------------------------------------------ sprite */
    /* o: x, y, h | w, anchor ('bottom'|'center'|'top'), rot (deg), alpha,
          flip, scale, shadow (0..1 = ground shadow width factor)           */
    sprite(key, o = {}) {
      if (!this.wants(key)) return;
      const im = this.img(key);
      if (!im || !im.width) return;
      this.dirty = true;
      const c = this.ctx;
      const ratio = im.width / im.height;
      let h = o.h, w = o.w;
      if (h == null && w == null) h = 600;
      if (h == null) h = w / ratio;
      if (w == null) w = h * ratio;
      const s = o.scale == null ? 1 : o.scale;
      if (s <= 0) return;

      const anchor = o.anchor || 'bottom';
      const ox = 0;
      const oy = anchor === 'bottom' ? -h : anchor === 'center' ? -h / 2 : 0;

      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.translate(o.x, o.y);
      if (o.rot) c.rotate(o.rot * Math.PI / 180);
      c.scale(s * (o.flip ? -1 : 1), s * (o.sy == null ? 1 : o.sy));

      if (o.shadow) {
        c.save();
        c.globalAlpha *= .5;
        c.fillStyle = this.C.shadow;
        c.beginPath();
        c.ellipse(0, anchor === 'bottom' ? 0 : h / 2, w * .3 * o.shadow, h * .022, 0, 0, 6.2832);
        c.fill();
        c.restore();
      }
      c.drawImage(im, ox - w / 2, oy, w, h);
      c.restore();
    }

    /* Draw part of a sprite sheet cell: src rect given as 0..1 fractions. */
    spriteCrop(key, sx, sy, sw, sh, o = {}) {
      if (!this.wants(key)) return;
      const im = this.img(key);
      if (!im || !im.width) return;
      this.dirty = true;
      const c = this.ctx;
      const SX = sx * im.width, SY = sy * im.height;
      const SW = sw * im.width, SH = sh * im.height;
      let h = o.h, w = o.w;
      const ratio = SW / SH;
      if (h == null && w == null) h = 200;
      if (h == null) h = w / ratio;
      if (w == null) w = h * ratio;
      const s = o.scale == null ? 1 : o.scale;
      const oy = (o.anchor || 'bottom') === 'bottom' ? -h : -h / 2;
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.translate(o.x, o.y);
      if (o.rot) c.rotate(o.rot * Math.PI / 180);
      c.scale(s * (o.flip ? -1 : 1), s);
      c.drawImage(im, SX, SY, SW, SH, -w / 2, oy, w, h);
      c.restore();
    }

    /* -------------------------------------------------------------- text */
    /* o: x, y, size, font ('display'|'script'|'body'), color, align,
          alpha, rot, ls (letter spacing), outline (px), outlineColor,
          scale, baseline                                                   */
    /* INK GATE. Everything below draws with the 2D context rather than from
       an image, so it has no asset key and wants() cannot place it. Left
       ungated it painted onto all four diorama panels at once, which on a
       phone showed as four copies of every title, trail and badge standing
       at four different depths: ghosted, and with the nearest copy hanging
       lowest, which is what made text and the travel plane read as "too
       low" in AR. It is authored as flat 2D ink over the picture, so it
       belongs on one panel. Preview passes (layer === null) are unaffected. */
    text(str, o = {}) {
      if (!this.on('characters')) return;
      const c = this.ctx;
      const size = o.size || 60;
      const fam = this.cfg.FONTS[o.font || 'display'].replace('{size}', size);
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.translate(o.x, o.y);
      if (o.rot) c.rotate(o.rot * Math.PI / 180);
      if (o.scale != null) c.scale(o.scale, o.scaleY == null ? o.scale : o.scaleY);
      c.font = fam;
      c.textBaseline = o.baseline || 'alphabetic';
      c.textAlign = 'center';
      c.lineJoin = 'round';

      const ls = o.ls || 0;
      const chars = [...str];
      const widths = chars.map(ch => c.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + ls * (chars.length - 1);
      const align = o.align || 'center';
      let x = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;

      const out = o.outline == null ? size * .16 : o.outline;
      c.strokeStyle = o.outlineColor || this.C.paper;
      c.lineWidth = out;
      c.fillStyle = o.color || this.C.ink;

      /* Typography stands with the characters, but the measurement below
         still has to run on every panel: scenes lay other things out from
         the width this returns. */
      const paint = this.on('characters');
      if (paint) this.dirty = true;
      for (let i = 0; i < chars.length; i++) {
        const cx = x + widths[i] / 2;
        if (paint) {
          if (out > 0) c.strokeText(chars[i], cx, 0);
          c.fillText(chars[i], cx, 0);
        }
        x += widths[i] + ls;
      }
      c.restore();
      return total;
    }

    /* Several lines with one call. */
    textBlock(lines, o = {}) {
      if (!this.on('characters')) return;
      const gap = o.lineHeight || (o.size || 46) * 1.35;
      lines.forEach((l, i) => {
        if (!l) return;
        const op = Object.assign({}, o, l.opts, { y: o.y + i * gap });
        this.text(l.text != null ? l.text : l, op);
      });
    }

    /* ------------------------------------------------------------ shapes */
    badge(x, y, r, o = {}) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.beginPath();
      c.arc(x, y, r, 0, 6.2832);
      c.fillStyle = o.fill || this.C.paper;
      c.fill();
      c.lineWidth = o.lw == null ? r * .09 : o.lw;
      c.strokeStyle = o.stroke || this.C.ink;
      c.stroke();
      c.restore();
    }

    /* An interest icon sitting inside its circle. */
    iconBadge(key, x, y, r, o = {}) {
      if (!this.on('characters')) return;
      const s = o.scale == null ? 1 : o.scale;
      if (s <= 0) return;
      this.dirty = true;
      const c = this.ctx;
      c.save();
      c.translate(x, y);
      c.rotate((o.rot || 0) * Math.PI / 180);
      c.scale(s, s);
      this.badge(0, 0, r, { alpha: o.alpha, fill: o.fill, stroke: o.stroke, lw: o.lw });
      const im = this.img(key);
      if (im && im.width) {
        const fit = r * 1.46;
        const ratio = im.width / im.height;
        let w = fit, h = fit / ratio;
        if (h > fit * .92) { h = fit * .92; w = h * ratio; }
        c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
        c.drawImage(im, -w / 2, -h / 2, w, h);
      }
      c.restore();
    }

    heart(x, y, s, o = {}) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.translate(x, y);
      c.rotate((o.rot || 0) * Math.PI / 180);
      c.scale(s, s);
      c.beginPath();
      c.moveTo(0, .32);
      c.bezierCurveTo(-.62, -.18, -.42, -.78, 0, -.44);
      c.bezierCurveTo(.42, -.78, .62, -.18, 0, .32);
      c.closePath();
      c.fillStyle = o.fill || this.C.chilli;
      c.fill();
      if (o.stroke !== false) {
        c.lineWidth = o.lw == null ? .055 : o.lw;
        c.strokeStyle = o.stroke || this.C.ink;
        c.stroke();
      }
      c.restore();
    }

    star(x, y, s, o = {}) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.translate(x, y);
      c.rotate((o.rot || 0) * Math.PI / 180);
      c.scale(s, s);
      c.beginPath();
      c.moveTo(0, -1);
      c.quadraticCurveTo(.13, -.13, 1, 0);
      c.quadraticCurveTo(.13, .13, 0, 1);
      c.quadraticCurveTo(-.13, .13, -1, 0);
      c.quadraticCurveTo(-.13, -.13, 0, -1);
      c.fillStyle = o.fill || this.C.marigold;
      c.fill();
      c.restore();
    }

    /* Comic impact shape. */
    burst(x, y, r, o = {}) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      const n = o.points || 14;
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.translate(x, y);
      c.rotate((o.rot || 0) * Math.PI / 180);
      c.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * 6.2832;
        const rr = r * (i % 2 ? (o.inner || .62) : 1) * (1 + (i % 3 === 0 ? .06 : -.03));
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr * (o.squash || .86);
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      c.fillStyle = o.fill || this.C.marigold;
      c.fill();
      if (o.stroke !== false) {
        c.lineWidth = o.lw || r * .045;
        c.strokeStyle = o.stroke || this.C.ink;
        c.stroke();
      }
      c.restore();
    }

    /* Radiating ink strokes: surprise, impact, excitement. */
    rays(x, y, o = {}) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      const n = o.count || 8;
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.translate(x, y);
      c.rotate((o.rot || 0) * Math.PI / 180);
      c.strokeStyle = o.color || this.C.ink;
      c.lineWidth = o.lw || 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.2832 + (o.offset || 0);
        const r0 = o.r0 == null ? 60 : o.r0;
        const r1 = o.r1 == null ? 100 : o.r1;
        const j = o.jitter ? (i % 2 ? .82 : 1.12) : 1;
        c.beginPath();
        c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * (o.squash || 1));
        c.lineTo(Math.cos(a) * r1 * j, Math.sin(a) * r1 * j * (o.squash || 1));
        c.stroke();
      }
      c.restore();
    }

    /* Soft ground so characters do not float in space. Deliberately a
       gradient, not a hard shape - in AR it has to melt into the camera feed. */
    ground(y, o = {}) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      const w = o.w || 560, h = o.h || 120, cy = y + (o.dip || 40);
      c.save();
      c.globalAlpha = (o.alpha == null ? 1 : clamp(o.alpha)) * .9;
      c.translate(this.W / 2, cy);
      c.scale(1, h / w);
      const gr = c.createRadialGradient(0, 0, w * .15, 0, 0, w);
      gr.addColorStop(0, o.fill || 'rgba(47,90,67,0.20)');
      gr.addColorStop(.55, o.fill || 'rgba(47,90,67,0.20)');
      gr.addColorStop(1, 'rgba(47,90,67,0)');
      c.fillStyle = gr;
      c.beginPath();
      c.arc(0, 0, w, 0, 6.2832);
      c.fill();
      c.restore();
    }

    shadow(x, y, w, alpha = 1) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      c.save();
      c.globalAlpha = clamp(alpha) * .55;
      c.fillStyle = this.C.shadow;
      c.beginPath();
      c.ellipse(x, y, w, w * .17, 0, 0, 6.2832);
      c.fill();
      c.restore();
    }

    /* ------------------------------------------------------------- paths */
    quad(p0, cp, p1, t) {
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * cp.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * cp.y + t * t * p1.y,
      };
    }

    /* Dashed travel trail revealed to `p` (0..1). Returns the head point and
       its angle so you can sit an aeroplane on it. */
    trail(p0, cp, p1, prog, o = {}) {
      /* deliberately NOT gated at the top: the dashes are gated further
         down, but every panel must still run through to the return below,
         because scenes sit the aeroplane on the head point it hands back */
      const c = this.ctx;
      const n = 42;
      const end = clamp(prog);
      const start = clamp(o.from || 0);
      if (end <= start) return this.quad(p0, cp, p1, end);
      /* The dashes ride with the characters, but every panel still needs
         the head point returned below — scenes sit the aeroplane on it. */
      if (this.on('characters')) {
        this.dirty = true;
        c.save();
        c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
        c.strokeStyle = o.color || this.C.chilli;
        c.lineWidth = o.lw || 7;
        c.setLineDash(o.dash || [22, 18]);
        c.lineDashOffset = o.offset || 0;
        c.beginPath();
        for (let i = 0; i <= n; i++) {
          const t = start + (end - start) * (i / n);
          const pt = this.quad(p0, cp, p1, t);
          i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y);
        }
        c.stroke();
        c.setLineDash([]);
        c.restore();
      }
      const head = this.quad(p0, cp, p1, end);
      const prev = this.quad(p0, cp, p1, Math.max(start, end - .02));
      head.angle = Math.atan2(head.y - prev.y, head.x - prev.x) * 180 / Math.PI;
      return head;
    }

    polyline(pts, o = {}) {
      if (!this.on('characters')) return;
      if (!this.on('characters')) return;
      this.dirty = true;
      const c = this.ctx;
      c.save();
      c.globalAlpha = o.alpha == null ? 1 : clamp(o.alpha);
      c.strokeStyle = o.color || this.C.ink;
      c.lineWidth = o.lw || 8;
      if (o.dash) { c.setLineDash(o.dash); c.lineDashOffset = o.offset || 0; }
      c.beginPath();
      pts.forEach((pt, i) => (i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y)));
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }

    /* Full-view cover used by the BAM / heart / sparkle transitions.
       Deliberately NOT gated to one panel: a wipe has to hide the whole
       diorama, so every panel paints it. */
    cover(color, alpha) {
      const c = this.ctx;
      if (alpha <= 0) return;
      this.dirty = true;
      c.save();
      c.globalAlpha = clamp(alpha);
      c.fillStyle = color;
      c.fillRect(-40, -40, this.W + 80, this.H + 80);
      c.restore();
    }
  }

  /* ------------------------------------------------------------- audio ---
     One element, one track, one question asked every frame: should music be
     sounding right now? Track turns that boolean into the things an <audio>
     element actually has — start, hold, stop — so play() is called only on a
     transition and never once per frame, and so there is only ever one
     instance of the track in existence.

     States:
       off      not sounding, position back at 0
       playing  sounding
       held     paused mid-track, position kept (the film is paused)
       blocked  wanted, but the browser refused autoplay
       capped   played the `limit` seconds this film uses, and stopped there

     THE AUTOPLAY PROBLEM, and the one gesture this film has to solve it.
     Browsers reject any play() that no user gesture has paid for, and the
     music is due at 67.8s when nothing has been touched: the film starts
     because the camera found a card, not because anyone tapped.

     There is exactly one intentional interaction in the whole piece — the
     drag at the airport, at 55.6s — and it is deliberately the only one, so
     Track listens for nothing on its own. Instead main.js's existing drag
     handler calls bless() on the pointer events it is already receiving,
     twelve seconds before the music is due, and bless() spends that gesture
     on a muted play()/pause(): the element is left permanently allowed to be
     started from script, which is what iOS Safari and Chrome both key on.
     Nothing is heard at the airport. All that changes is that the sangeet is
     now allowed to start the track.

     A viewer who never drags (the gate gives up after DRAG.fallback and the
     film carries on) gets no music, and that is the intended trade: the
     interaction model is one drag, and no stray tap anywhere else is
     treated as an interaction. */
  class Track {
    constructor(src, volume = .4, limit = 0) {
      this.src = src;
      this.volume = volume;
      this.limit = limit;        // seconds of the file this film uses (0 = all)
      this.el = null;
      this.state = 'off';
      this.blessed = false;      // has the drag bought playback permission?
      this.blessing = false;
      this.log = null;           // set by ?debug=1
    }

    /* Built on first use, then kept — the same element for the film's life,
       so resuming continues from the position it was paused at. */
    node() {
      if (!this.el) {
        const a = new Audio();
        a.preload = 'auto';
        a.loop = false;
        a.volume = clamp(this.volume);
        a.src = this.src;
        this.el = a;
      }
      return this.el;
    }

    /* Start fetching early — the file is megabytes and the music is due
       mid-film, so the network should never be what makes it late. */
    prime() {
      const a = this.node();
      if (a.load) a.load();
    }

    say(...m) { if (this.log) console.log('[audio]', ...m); }

    /* The only method the director calls. `want` is "the film is inside the
       stretch that has music"; `running` is "the film is advancing at all". */
    update(want, running) {
      if (want && running) {
        /* only the first `limit` seconds of the file are this film's */
        if (this.limit && this.el && this.el.currentTime >= this.limit) {
          if (!this.el.paused) this.el.pause();
          if (this.state !== 'capped') this.say('capped at', this.limit + 's');
          this.state = 'capped';
          return;
        }
        if (this.state === 'off' || this.state === 'held') this.play();
        return;                  // playing / blocked / capped all wait
      }
      if (want) {
        if (this.state === 'playing') this.hold();
        return;                  // paused mid-sequence: keep the position
      }
      if (this.state !== 'off') this.stop();
    }

    play() {
      const a = this.node();
      const fresh = this.state !== 'held';     // a resume keeps its position
      if (fresh) { try { a.currentTime = 0; } catch (e) { /* not seekable */ } }
      a.muted = false;
      a.volume = clamp(this.volume);
      this.state = 'playing';
      const p = a.play();
      this.say('play()', fresh ? 'from 0' : 'resume at ' + a.currentTime.toFixed(2));
      /* Only ever a .catch on `p` itself — chaining a .then here would leave
         the rejection unhandled and log a page error on every refusal. */
      if (p && p.catch) p.catch(err => {
        if (this.state !== 'playing') return;  // stopped while play() settled
        this.state = 'blocked';
        this.say('refused (' + err.name + ') — the airport drag was not taken');
      });
    }

    hold() {
      if (this.el) this.el.pause();
      this.state = 'held';
    }

    /* The sequence ended, or the film reset: silence, and back to the top. */
    stop() {
      if (this.el) {
        this.el.pause();
        try { this.el.currentTime = 0; } catch (e) { /* not seekable yet */ }
      }
      this.say('stop');
      this.state = 'off';
    }

    /* Called from inside the airport drag, and from nowhere else. A muted
       play()/pause() within that gesture: silent, instant, invisible, and
       afterwards the element may be started from script at any time.

       Cheap and idempotent on purpose — the drag hands it several pointer
       events and it runs on them until one sticks. */
    bless() {
      /* `blessing` matters: play() settles a tick later, so without it the
         pointerdown and the pointerup of one drag both run this. */
      if (this.blessing || this.blessed) return;
      if (this.state === 'playing' || this.state === 'held') return;
      /* Only reachable if the clock was scrubbed past the airport: the music
         is already due, so this gesture starts it outright. */
      if (this.state === 'blocked') { this.blessed = true; this.play(); return; }
      const a = this.node();
      this.blessing = true;
      a.muted = true;
      const settle = () => {
        this.blessed = true;
        this.blessing = false;
        a.muted = false;
        a.volume = clamp(this.volume);
        /* Guard: if the celebrations somehow began while this settled, the
           real playback owns the element now — do not rewind it. */
        if (this.state === 'playing' || this.state === 'held') return;
        a.pause();
        try { a.currentTime = 0; } catch (e) { /* not seekable */ }
        this.say('unlocked by the airport drag');
      };
      const p = a.play();
      if (p && p.then) p.then(settle, () => {          // refused: try again on
        a.muted = false;                               // the next drag event
        this.blessing = false;
      });
      else settle();
    }
  }

  return { clamp, lerp, ease, p, pl, on, life, q, hops, bob, Stage, Track };
})();

window.E = E;
