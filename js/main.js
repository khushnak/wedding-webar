/* ==========================================================================
   MAIN — loads the artwork, drives the timeline, and hangs the canvas on the
   AR marker.

   Dev switches (add to the URL):
     ?preview=1        play full screen with no camera
     ?scene=paris      loop a single scene
     ?t=42             start the film 42 seconds in
     ?debug=1          scene + time readout, AR.js debug UI
   ========================================================================== */

(() => {
  const C = CONFIG;
  const Q = new URLSearchParams(location.search);
  const PREVIEW = Q.has('preview');
  const DEBUG = Q.has('debug');
  const START_AT = parseFloat(Q.get('t') || '0') || 0;
  const ONLY = Q.get('scene');

  const el = id => document.getElementById(id);
  const canvas = el('stage');
  const stage = new E.Stage(canvas, C);

  const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);
  const RUN = ONLY ? (SCENES.find(s => s.id === ONLY) || {}).dur || TOTAL : TOTAL;

  /* ------------------------------------------------------------- loading */

  function loadImages() {
    const entries = Object.entries(C.ASSETS);
    let done = 0;
    return Promise.all(entries.map(([key, path]) => new Promise(resolve => {
      const im = new Image();
      im.onload = im.onerror = () => {
        done++;
        el('loader-text').textContent =
          `Loading the story… ${Math.round(done / entries.length * 100)}%`;
        resolve([key, im]);
      };
      im.src = 'assets/' + path;
    }))).then(pairs => {
      const map = {};
      pairs.forEach(([k, im]) => {
        if (!im.width) console.warn('[invite] missing asset:', C.ASSETS[k]);
        map[k] = im;
      });
      stage.setImages(map);
    });
  }

  /* Fonts must be ready before the first frame or the first titles pop in
     with the fallback face and then jump. */
  function loadFonts() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return Promise.race([
      document.fonts.ready,
      new Promise(r => setTimeout(r, 2500)),
    ]);
  }

  /* ------------------------------------------------------------ director */

  const director = {
    time: START_AT,
    playing: PREVIEW,      // preview starts immediately; AR waits for the card
    lostFor: 0,
    lastDraw: -1,

    reset() { this.time = START_AT; this.lastDraw = -1; },

    play() { this.playing = true; this.lostFor = 0; },

    pause() { this.playing = false; },

    /* dt in seconds */
    advance(dt) {
      if (!this.playing) return;
      this.time += dt;
      if (this.time > RUN + C.LOOP_GAP) {
        this.time = 0;
        this.lastDraw = -1;      // the frame clock wrapped too
      }
    },

    draw() {
      const minStep = 1 / C.STAGE.fpsCap;
      const since = this.time - this.lastDraw;
      if (this.lastDraw >= 0 && since >= 0 && since < minStep) return false;
      this.lastDraw = this.time;

      stage.begin();
      let t = Math.min(this.time, RUN);

      if (ONLY) {
        const s = SCENES.find(x => x.id === ONLY);
        if (s) s.draw(stage, Math.min(t, s.dur));
      } else {
        let acc = 0;
        for (const s of SCENES) {
          if (t < acc + s.dur || s === SCENES[SCENES.length - 1]) {
            s.draw(stage, Math.min(t - acc, s.dur));
            if (DEBUG) hud(s.id, t - acc, t);
            break;
          }
          acc += s.dur;
        }
      }
      return true;
    },
  };

  function hud(id, local, total) {
    const c = stage.ctx;
    c.save();
    c.globalAlpha = .85;
    c.fillStyle = '#241d18';
    c.fillRect(0, 0, 430, 58);
    c.fillStyle = '#f3efe6';
    c.font = "600 30px 'Baloo 2', sans-serif";
    c.fillText(`${id}  ${local.toFixed(1)}s   [${total.toFixed(1)}/${RUN}]`, 14, 40);
    c.restore();
  }

  /* --------------------------------------------------------------- modes */

  function startPreview(reason) {
    document.body.classList.add('preview');
    el('loader').hidden = true;
    el('hint').hidden = true;
    el('error').hidden = true;
    if (reason) console.info('[invite] preview mode:', reason);

    const fit = () => {
      const s = Math.min(innerWidth / C.STAGE.w, innerHeight / C.STAGE.h);
      canvas.style.width = C.STAGE.w * s + 'px';
      canvas.style.height = C.STAGE.h * s + 'px';
    };
    addEventListener('resize', fit);
    fit();

    director.play();
    let last = performance.now();
    const loop = now => {
      director.advance(Math.min(.1, (now - last) / 1000));
      last = now;
      director.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* --------------------------------------------------------------- AR.js */

  function markerAttrs() {
    if (C.MARKER.type === 'pattern') {
      return `type="pattern" url="${C.MARKER.patternUrl}"`;
    }
    return 'preset="hiro"';
  }

  function buildScene() {
    const m = C.MARKER;
    el('ar-root').innerHTML = `
      <a-scene
        embedded
        vr-mode-ui="enabled: false"
        device-orientation-permission-ui="enabled: false"
        renderer="alpha: true; antialias: true; precision: mediump; colorManagement: false; sortObjects: true"
        arjs="sourceType: webcam; detectionMode: mono_and_matrix; matrixCodeType: 3x3;
              patternRatio: 0.5; maxDetectionRate: 30;
              sourceWidth: 640; sourceHeight: 480; displayWidth: 1280; displayHeight: 960;
              debugUIEnabled: ${DEBUG ? 'true' : 'false'}">
        <a-marker ${markerAttrs()}
          smooth="true"
          smoothCount="${m.smoothing.count}"
          smoothTolerance="${m.smoothing.tolerance}"
          smoothThreshold="${m.smoothing.threshold}"
          id="marker">
          <a-entity story-plane></a-entity>
        </a-marker>
        <a-entity camera></a-entity>
      </a-scene>`;

    const marker = el('marker');
    marker.addEventListener('markerFound', () => {
      el('hint').hidden = true;
      if (!director.playing) director.reset();
      director.play();
    });
    marker.addEventListener('markerLost', () => director.pause());
  }

  function registerComponent() {
    AFRAME.registerComponent('story-plane', {
      init() {
        const m = C.MARKER;
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        this.tex = tex;

        const h = m.scale;
        const w = h * (C.STAGE.w / C.STAGE.h);
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.01,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
          })
        );
        /* Upright, standing on the card and facing the reader. */
        mesh.position.set(0, h * 0.52 + m.height * 0.12, 0);
        this.baseY = mesh.position.y;
        this.mesh = mesh;
        this.el.setObject3D('mesh', mesh);

        this.rise = 0;
        this.last = performance.now();
      },

      tick() {
        const now = performance.now();
        const dt = Math.min(.1, (now - this.last) / 1000);
        this.last = now;

        /* content rises out of the card the moment it is found */
        const target = director.playing ? 1 : 0;
        this.rise += (target - this.rise) * Math.min(1, dt * (target ? 4.5 : 9));
        const r = E.ease.back(E.clamp(this.rise));
        this.mesh.scale.setScalar(0.25 + 0.75 * E.clamp(this.rise * 1.2));
        this.mesh.position.y = this.baseY * (0.15 + 0.85 * r);
        this.mesh.material.opacity = E.clamp(this.rise * 1.6);

        if (!director.playing) {
          director.lostFor += dt;
          if (director.lostFor > C.RESET_AFTER_LOST) director.reset();
          return;
        }
        director.advance(dt);
        if (director.draw()) this.tex.needsUpdate = true;
      },
    });
  }

  /* ----------------------------------------------------------- bootstrap */

  function showError(msg) {
    el('loader').hidden = true;
    el('hint').hidden = true;
    el('error').hidden = false;
    if (msg) el('error-sub').textContent = msg;
  }

  el('preview-btn').addEventListener('click', () => {
    const u = new URL(location.href);
    u.searchParams.set('preview', '1');
    location.href = u.toString();
  });

  async function boot() {
    await Promise.all([loadImages(), loadFonts()]);
    director.draw();

    if (PREVIEW) return startPreview('requested');

    /* Ask for the camera up front so we can give a real message if it fails,
       instead of AR.js silently showing a black screen. */
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      s.getTracks().forEach(t => t.stop());
    } catch (err) {
      return showError(
        location.protocol === 'https:' || location.hostname === 'localhost'
          ? 'Camera permission was declined. Reload and allow access to use the card.'
          : 'Open this page over https:// (or localhost) — browsers only give camera access on secure pages.'
      );
    }

    const scripts = [
      'https://aframe.io/releases/1.4.2/aframe.min.js',
      'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.5/aframe/build/aframe-ar.js',
    ];
    for (const src of scripts) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => rej(new Error(src));
        document.head.appendChild(s);
      }).catch(() => showError('Could not load the AR library. Check your connection.'));
    }
    if (!window.AFRAME) return;

    registerComponent();
    buildScene();
    el('loader').hidden = true;
    el('hint').hidden = false;
  }

  boot();
})();
