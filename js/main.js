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

  /* ?preview=1 keeps the original single composite canvas — one stage that
     paints everything, exactly as before. In AR the film is split across one
     canvas per diorama panel (CONFIG.LAYERS): the whole scene file runs once
     per panel, each onto its own canvas and 2D context, and each pass paints
     only the artwork that belongs to that panel. Running the scene per panel
     rather than routing individual draws is what keeps the camera pans,
     save/restore nesting and world-space tiling working untouched.
     The visible #stage canvas doubles as the characters panel. */
  const LAYER_ORDER = (C.LAYERS && C.LAYERS.order) || ['characters'];
  const STAGES = PREVIEW
    ? [new E.Stage(canvas, C)]
    : LAYER_ORDER.map(name => new E.Stage(
        name === 'characters' ? canvas : document.createElement('canvas'), C, name));

  const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0);
  const RUN = ONLY ? (SCENES.find(s => s.id === ONLY) || {}).dur || TOTAL : TOTAL;

  /* ------------------------------------------------------------- music */
  /* Sangeet, wedding and reception are three cards of ONE scene, so the
     music is one window on the story clock rather than three cues: it opens
     on the first frame of the celebrations scene and closes on its last.
     Nothing inside that window touches the track, which is what keeps the
     same playback position running across all three cards.

     The window is derived from the playlist, so re-timing a scene in
     config.js moves the music with it and nothing here needs editing. Note
     it is story time, not wall-clock: the paris drag gates stop the clock,
     and the music waits with it. */
  const MUSIC_AT = (() => {
    const i = SCENES.findIndex(s => s.id === 'celebrations');
    if (i < 0) return null;
    /* ?scene=celebrations previews the sequence on its own clock; any other
       single-scene preview is one of the silent scenes. */
    if (ONLY) return ONLY === 'celebrations' ? { from: 0, to: SCENES[i].dur } : null;
    const from = SCENES.slice(0, i).reduce((a, s) => a + s.dur, 0);
    return { from, to: from + SCENES[i].dur };
  })();
  /* The film uses only the opening stretch of the file — exactly as many
     seconds as the celebrations scene is long, so the music can never run on
     past the picture even if the mp3 is minutes longer (this one is 346s). */
  const music = (MUSIC_AT && C.AUDIO && C.AUDIO.celebrations)
    ? new E.Track(C.AUDIO.celebrations, C.AUDIO.volume, MUSIC_AT.to - MUSIC_AT.from)
    : null;
  if (music && DEBUG) music.log = true;

  /* ----------------------------------------------------------- the gates */
  /* A scene may declare `gates`: local times at which the film waits for the
     viewer to pull the journey forward. The clock stops dead on the gate
     frame, so every scene stays exactly the pure draw(stage, t) function it
     was — the gate changes when t advances, never what t means. */
  function buildGates() {
    const out = [];
    if (ONLY) {
      const s = SCENES.find(x => x.id === ONLY);
      if (s && s.gates) s.gates.forEach(lt => out.push({ at: lt, done: false }));
      return out;
    }
    let acc = 0;
    for (const s of SCENES) {
      if (s.gates) s.gates.forEach(lt => out.push({ at: acc + lt, done: false }));
      acc += s.dur;
    }
    return out;
  }
  const GATES = buildGates();
  const dragThreshold = () =>
    Math.max(C.DRAG.thresholdMin,
      Math.min(C.DRAG.thresholdMax, innerWidth * C.DRAG.thresholdFrac));

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
      STAGES.forEach(st => st.setImages(map));
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
    playing: PREVIEW,      // preview starts immediately; AR waits for tap + marker
    /* Whether the marker is currently considered tracked. Debounced by the
       same grace timer as playback (see buildScene), so it drives the rise/
       sink visual without flickering on a brief tracking blip. Kept apart
       from `playing` because the film can be visible-but-paused: found for
       the first time and waiting on the user's tap. */
    found: PREVIEW,
    lastDraw: -1,
    drag: 0,               // 0..1 while a gate is open, for the scene to read
    held: false,           // is the clock currently waiting on a gesture?
    waited: 0,

    reset() {
      this.time = START_AT;
      this.lastDraw = -1;
      this.clearGates();
      if (music) music.stop();       // a restarted film restarts silent
    },

    /* Called once per frame, alongside advance(). It only reports where the
       clock is; Track decides whether that means starting, continuing or
       stopping, so play() is never issued from a drawing path. */
    syncMusic() {
      if (!music) return;
      const inside = this.time >= MUSIC_AT.from && this.time < MUSIC_AT.to;
      music.update(inside, this.playing);
    },

    clearGates() {
      GATES.forEach(x => { x.done = false; });
      this.held = false; this.waited = 0; this.drag = 0;
    },

    openGate() { return GATES.find(x => !x.done) || null; },

    play() { this.playing = true; this.lostFor = 0; },

    play() { this.playing = true; },

    pause() { this.playing = false; },

    /* dt in seconds */
    advance(dt) {
      if (!this.playing) return;

      const gate = this.openGate();
      if (gate && this.time + dt >= gate.at) {
        /* land exactly on the gate frame and hold there */
        this.time = gate.at;
        this.held = true;
        this.waited += dt;
        /* released by the gesture, or by the fallback so the story never
           dead-ends for someone who does not find it */
        if (this.drag >= 1 || this.waited >= C.DRAG.fallback) {
          gate.done = true;
          this.held = false;
          this.waited = 0;
          this.drag = 0;
        }
        return;
      }

      this.held = false;
      this.time += dt;
      if (this.time > RUN + C.LOOP_GAP) {
        this.time = 0;
        this.lastDraw = -1;      // the frame clock wrapped too
        this.clearGates();
      }
    },

    draw() {
      const minStep = 1 / C.STAGE.fpsCap;
      const since = this.time - this.lastDraw;
      /* while a gate holds, `time` stops changing but the drag response must
         still repaint, so the frame-rate gate is skipped */
      if (!this.held && this.lastDraw >= 0 && since >= 0 && since < minStep) return false;
      this.lastDraw = this.time;

      const t = Math.min(this.time, RUN);

      /* One pass per diorama panel (just one in preview). */
      for (const st of STAGES) {
        /* The airport gate's drag position, handed to the scene the same way
           it always was — but now once per panel. Every pass needs it, not
           just the panel that paints the plane, because a pass that cannot
           see g.drag would draw its share of the affordance un-dragged. */
        st.drag = this.held ? this.drag : 0;
        st.begin();
        if (ONLY) {
          const s = SCENES.find(x => x.id === ONLY);
          if (s) s.draw(st, Math.min(t, s.dur));
        } else {
          let acc = 0;
          for (const s of SCENES) {
            if (t < acc + s.dur || s === SCENES[SCENES.length - 1]) {
              s.draw(st, Math.min(t - acc, s.dur));
              if (DEBUG && st.on('characters')) hud(st, s.id, t - acc, t);
              break;
            }
            acc += s.dur;
          }
        }
      }
      return true;
    },
  };

  /* ------------------------------------------------------ the gesture */
  /* Pull the journey forward — once, at the airport. The affordance is the
     plane and its line, so there is no control to hit: while the gate is
     open the whole frame is the handle, which is the only thing that can
     work reliably when the picture is a texture on an AR panel rather than
     a DOM element under the finger.

     Listeners are passive and never call preventDefault, so nothing here
     touches AR.js's own input or the page's scrolling. */
  function initDrag() {
    let startX = 0, startY = 0, active = false, spent = false;

    /* The scene publishes its target as <stage>.hit in stage coordinates,
       and clears it to null on any pass that is not showing the plane. Now
       that the film is split across diorama panels the box is published on
       whichever panel paints the affordance, so take the first panel that
       has one. In preview there is only ever a single stage, so this is
       exactly the lookup it has always been. */
    const hitBox = () => {
      for (const st of STAGES) if (st.hit) return st.hit;
      return null;
    };

    /* Is this pointer on the affordance? In preview the canvas is laid out
       on screen, so the pointer maps onto it exactly and only the plane, its
       line and the forgiving patch around them are draggable. Under AR the
       canvas is parked off-screen (css left:-10000px) and painted onto a
       THREE panel instead, so no such mapping exists — there the gesture is
       accepted anywhere, which is the only thing that works reliably and
       costs nothing, since the gate is open solely while the plane is
       sitting there waiting. */
    const onTarget = e => {
      const hit = hitBox();
      if (!hit) return false;
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height || r.right < 0 || r.left > innerWidth) return true;
      const sx = (e.clientX - r.left) / r.width * C.STAGE.logicalW;
      const sy = (e.clientY - r.top) / r.height * C.STAGE.logicalH;
      return sx >= hit.x0 && sx <= hit.x1 && sy >= hit.y0 && sy <= hit.y1;
    };

    const down = e => {
      if (!director.held) return;         // only while the journey is waiting
      if (!onTarget(e)) return;           // and only on the plane itself
      /* The one gesture in the film, so the one chance to make the music
         legal. bless() is a silent muted play/pause that buys the browser's
         permission to start the track from script later; it does not start
         anything now, and the sangeet is still what begins the music twelve
         seconds from here. Nothing about the drag itself changes. */
      if (music) music.bless();
      active = true;
      spent = false;
      startX = e.clientX;
      startY = e.clientY;
      director.drag = 0;
    };

    const move = e => {
      if (!active || spent) return;
      /* Forward is RIGHTWARD, matching the way the plane points and the
         arrow under it. Vertical drift is ignored rather than
         disqualifying, so a diagonal pull still reads; only a
         mostly-vertical one fails to accumulate. */
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dx <= 0) { director.drag = 0; return; }
      if (Math.abs(dy) > Math.abs(dx) * 2.5) return;
      director.drag = Math.min(1, dx / dragThreshold());
      /* Once it releases, this gesture is finished: the finger staying down
         cannot roll straight on into the next destination. */
      if (director.drag >= 1) spent = true;
    };

    const up = () => {
      /* Same gesture, second chance: Safari is happiest granting playback
         on the end of a touch, and by here the drag is certainly real. */
      if (active && music) music.bless();
      active = false;
      /* a short pull that never reached the threshold simply springs back */
      if (!spent) director.drag = 0;
    };

    const opt = { passive: true };
    addEventListener('pointerdown', down, opt);
    addEventListener('pointermove', move, opt);
    addEventListener('pointerup', up, opt);
    addEventListener('pointercancel', up, opt);
  }

  function hud(st, id, local, total) {
    const c = st.ctx;
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
    initDrag();
    let last = performance.now();
    const loop = now => {
      director.advance(Math.min(.1, (now - last) / 1000));
      last = now;
      director.syncMusic();
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
    const hintTitle = el('hint-title');
    const hintSub = el('hint-sub');
    const POINT_TITLE = hintTitle.textContent;
    const POINT_SUB = hintSub.textContent;

    /* Has the user tapped to begin yet? Only the first qualifying tap does
       anything (see onTap below) — every requirement about starting and
       resuming reduces to keeping `playing` in sync with (started && found). */
    let started = false;

    function showTapHint() {
      hintTitle.textContent = 'Tap to begin';
      hintSub.textContent = 'Tap anywhere on the screen to start the story.';
      el('hint').hidden = false;
    }
    function showPointHint() {
      hintTitle.textContent = POINT_TITLE;
      hintSub.textContent = POINT_SUB;
      el('hint').hidden = false;
    }
    function syncPlaying() {
      if (started && director.found) director.play();
      else director.pause();
    }

    /* AR.js's own frame-by-frame detection can miss a frame from motion
       blur or a brief partial occlusion during normal handheld movement,
       firing a markerLost immediately followed by markerFound. Without
       this grace window every such blip paused the animation (and, before
       tap-to-start existed, visibly dipped it), which read as "restarting"
       on the smallest phone movement. The debounce sits on `director.found`
       itself — not just on pause — so both the rise/sink visual and
       playback stay untouched by a blip shorter than the grace window; a
       real loss (card moved away, out of frame) still hides/pauses. */
    const LOST_GRACE_MS = 300;
    let lostTimer = null;

    marker.addEventListener('markerFound', () => {
      clearTimeout(lostTimer);
      lostTimer = null;
      director.found = true;
      if (started) el('hint').hidden = true;   // resuming: no new tap needed
      else showTapHint();                       // first time: shown, but waits
      syncPlaying();
    });

    marker.addEventListener('markerLost', () => {
      clearTimeout(lostTimer);
      lostTimer = setTimeout(() => {
        director.found = false;      // AR.js also hides the object3D itself
        if (!started) showPointHint();
        else el('hint').hidden = true;   // already running: resumes silently on re-find
        syncPlaying();                    // pauses at the exact current time — no reset
      }, LOST_GRACE_MS);
    });

    /* Tap-to-start. A plain 'click' (not touchstart/pointerdown) is used
       deliberately: it never needs preventDefault, so it cannot interfere
       with anything AR.js binds for its own camera/canvas handling, and it
       does not trigger a navigation or reload since nothing here is a link
       or form. Only counts while the marker is actually visible, so an
       incidental tap before the card is ever found (adjusting the phone,
       dismissing browser chrome) does no harm; only the first such tap
       does anything. */
    function onTap() {
      if (started || !director.found) return;
      started = true;
      el('hint').hidden = true;
      syncPlaying();
    }
    document.addEventListener('click', onTap);
  }

  function registerComponent() {
    AFRAME.registerComponent('story-plane', {
      init() {
        const m = C.MARKER;
        const h = m.scale;
        const w = h * (C.STAGE.w / C.STAGE.h);
        const tilt = -(m.tiltDeg || 0) * Math.PI / 180;
        const depth = (C.LAYERS && C.LAYERS.depth) || {};
        /* Standing on the card, leaning back toward a viewer above it.
           AR.js post-multiplies the marker pose by makeRotationX(+PI/2)
           (threex-armarkercontrols), which maps a-marker local +Y onto
           the card's surface normal: +Y is straight up out of the flat
           card, X and Z lie in the card's plane, and +Z points at the
           reader's side of the printed marker.

           PlaneGeometry spans local X (width) and Y (height) with its
           face normal on +Z, so with rotation at the identity a panel
           stands at a true 90 deg to the card — but its face aims
           horizontally, across the card, which is why it only reads
           square-on with the phone down at card level. Leaning it back
           about X by MARKER.tiltDeg lifts that normal to point tiltDeg
           above the card, so it reads from a phone held above instead.

           One group carries the whole diorama, so the rise animation
           below moves and scales every panel together and none of them
           can drift out of their depth spacing. Because the group itself
           is unrotated, each panel's own position.z runs along the card's
           +Z — the panels are parallel leaning sheets standing at
           different distances along the print, like a pop-up card, and
           that spacing is what produces the parallax as the phone moves. */
        const group = new THREE.Group();
        /* Bottom edge of the leaning panels rests just above the card, so
           the scene grows out of the print instead of hovering over it.
           A tilted panel of height h only spans h*cos(tilt) vertically, and
           the group's zoom stretches that, so both are folded in here to
           keep the bottom edge planted whatever dioramaScale is set to.
           The clearance itself stays unscaled — it is an absolute gap. */
        this.zoom = m.dioramaScale || 1;
        group.position.set(0, this.zoom * (h / 2) * Math.cos(tilt) + m.height * 0.05, 0);
        this.baseY = group.position.y;
        this.group = group;
        this.el.setObject3D('mesh', group);

        this.panels = STAGES.map((st, i) => {
          const tex = new THREE.CanvasTexture(st.cv);
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
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
          mesh.rotation.x = tilt;                     // all panels stay parallel
          mesh.position.z = depth[st.layer] || 0;     // back (-) to front (+)
          mesh.renderOrder = i;                       // painted back panel first
          group.add(mesh);
          return { mesh, tex, stage: st, wasDirty: true };
        });

        this.rise = 0;
        this.last = performance.now();
      },

      tick() {
        const now = performance.now();
        const dt = Math.min(.1, (now - this.last) / 1000);
        this.last = now;

        /* content rises out of the card the moment the marker is tracked —
           independent of whether playback has actually started yet, so the
           diorama is visibly anchored while it waits for the first tap */
        const target = director.found ? 1 : 0;
        this.rise += (target - this.rise) * Math.min(1, dt * (target ? 4.5 : 9));
        const r = E.ease.back(E.clamp(this.rise));
        /* the whole diorama rises and grows as one, depth spacing intact —
           the rise curve is unchanged, just multiplied by the overall zoom */
        this.group.scale.setScalar(this.zoom * (0.25 + 0.75 * E.clamp(this.rise * 1.2)));
        this.group.position.y = this.baseY * (0.15 + 0.85 * r);
        const op = E.clamp(this.rise * 1.6);
        for (const p of this.panels) p.mesh.material.opacity = op;

        if (!director.playing) {
          director.lostFor += dt;
          if (director.lostFor > C.RESET_AFTER_LOST) director.reset();
          director.syncMusic();          // card away: the music waits with the film
          return;
        }
        director.advance(dt);
        director.syncMusic();
        /* Only re-upload panels that actually painted this frame — an empty
           midground costs nothing in scenes that have none. The wasDirty
           term pushes one final upload after a panel empties, so a cleared
           canvas replaces its last contents instead of freezing on screen. */
        if (director.draw()) {
          for (const p of this.panels) {
            if (p.stage.dirty || p.wasDirty) p.tex.needsUpdate = true;
            p.wasDirty = p.stage.dirty;
          }
        }
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
    if (music) music.prime();        // buffer it now, not at 67.8s
    await Promise.all([loadImages(), loadFonts()]);
    director.draw();

    if (PREVIEW) return startPreview('requested');

    // AR.js opens the webcam itself and already asks for the rear camera:
    // its own constraints are hard-coded to
    //   {audio: false, video: {facingMode: "environment", width/height ideal}}
    // so nothing here needs to select the camera. The video element it
    // creates also already carries autoplay/muted/playsinline, which is
    // what mobile browsers require to start a stream without a tap.

    // getUserMedia is only exposed in a secure context (https://, or
    // localhost). On a plain http:// LAN address on a phone it is simply
    // missing, and AR.js would fail deep inside its own init with nothing
    // shown on screen — surface that now instead of hanging forever.
    if (!window.isSecureContext) {
      return showError('Open this page over https:// (or localhost) to use the camera.');
    }

    // AR.js requests the webcam itself once the <a-scene> below is built,
    // and reports the outcome via these window events. Hook them up so a
    // denied/unavailable camera shows the error screen, and so the loader
    // stays up (never a bare black screen) until the feed is truly live,
    // instead of unhiding it right after the scene markup is injected.
    let cameraReady = false;
    window.addEventListener('camera-error', (e) => {
      console.error('[invite] camera-error', e.detail || e);
      showError('Camera access was blocked. Allow camera permission and reload.');
    });
    window.addEventListener('camera-init', () => {
      cameraReady = true;
      el('loader').hidden = true;
      el('hint').hidden = false;
    });

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
    initDrag();

    // Safety net only: the 'camera-init' listener above is what normally
    // hides the loader, the moment the webcam feed is actually live. If a
    // future/older AR.js build ever fails to fire that event, fall back
    // to unhiding here so the UI can't get stuck on the spinner forever.
    setTimeout(() => {
      if (!cameraReady && el('error').hidden) {
        console.warn('[invite] camera-init never fired; showing UI anyway');
        el('loader').hidden = true;
        el('hint').hidden = false;
      }
    }, 8000);
  }

  boot();
})();
