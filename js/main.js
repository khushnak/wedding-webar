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
    /* The window now runs from the first frame of the celebrations to the
       LAST frame of the film — the ending rides away under the same track,
       so the music neither stops when the couple appear nor restarts when
       they kiss. One window, one play(), exactly as before; only longer. */
    if (ONLY) {
      if (ONLY === 'celebrations' || ONLY === 'ending') {
        return { from: 0, to: SCENES.find(x => x.id === ONLY).dur };
      }
      return null;
    }
    const from = SCENES.slice(0, i).reduce((a, s) => a + s.dur, 0);
    return { from, to: SCENES.reduce((a, s) => a + s.dur, 0) };
  })();
  /* The film uses only the opening stretch of the file — exactly as many
     seconds as the celebrations scene is long, so the music can never run on
     past the picture even if the mp3 is minutes longer (this one is 346s). */
  /* The cap is the window plus slack. Story time STOPS at the kiss gate
     while the viewer decides, but the audio playhead does not — without the
     slack a long pause there would run the track into its limit and cut the
     music off mid-scene. */
  const MUSIC_SLACK = 45;
  const music = (MUSIC_AT && C.AUDIO && C.AUDIO.celebrations)
    ? new E.Track(C.AUDIO.celebrations, C.AUDIO.volume,
                  MUSIC_AT.to - MUSIC_AT.from + MUSIC_SLACK)
    : null;
  if (music && DEBUG) music.log = true;

  /* Plays once, the instant the story actually starts — from onTap() in AR
     (fired synchronously inside that real click event, which is what lets a
     browser's autoplay policy allow it) and from startPreview() on desktop.
     Unlike the Track class above, which starts the celebrations music much
     later than its own triggering gesture and needs the bless() workaround,
     this needs no such thing — a direct Audio().play() is enough wherever
     it's called from a real (or, in preview, load-time) start moment.

     The element is built once, up front, and primed with .load() the same
     place the music is (see boot()) — building `new Audio()` fresh at tap
     time meant the browser only started fetching the file at that exact
     instant, so .play() had to wait out however long that fetch/decode
     took, which read as the sound lagging behind the animation. */
  const startSound = (C.AUDIO && C.AUDIO.start) ? new Audio(C.AUDIO.start) : null;
  if (startSound) {
    startSound.preload = 'auto';
    startSound.volume = C.AUDIO.startVolume == null ? 0.7 : C.AUDIO.startVolume;
  }
  function playStartSound() {
    if (!startSound) return;
    try { startSound.currentTime = 0; } catch (e) { /* not seekable yet */ }
    startSound.play().catch(() => {});
  }

  /* When the travel card is on screen: the paris scene's own window on the
     story clock, worked out the same way the music window is. */
  const TRAVEL_AT = (() => {
    const i = SCENES.findIndex(s => s.id === 'paris');
    if (i < 0) return null;
    if (ONLY) return ONLY === 'paris' ? { from: 0, to: SCENES[i].dur } : null;
    const from = SCENES.slice(0, i).reduce((a, s) => a + s.dur, 0);
    return { from, to: from + SCENES[i].dur };
  })();

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

  /* One image bank, handed to every panel ONCE and then filled in place.
     Stage.setImages keeps the reference, so a picture that arrives later is
     visible to all four panels the moment it lands — which is what lets the
     film start before the artwork has all downloaded, with no reload, no
     re-assignment and no change to engine.js. */
  const IMAGES = {};

  function loadKeys(keys, onOne) {
    return Promise.all(keys.map(key => new Promise(resolve => {
      const path = C.ASSETS[key];
      if (!path) { resolve(); return; }
      const im = new Image();
      /* decode off the main thread: several of these are 2-3 MB PNGs, and
         decoding them inline stalls the very frames the loader is drawing */
      im.decoding = 'async';
      im.onload = im.onerror = () => {
        if (!im.width) console.warn('[invite] missing asset:', path);
        IMAGES[key] = im;
        if (onOne) onOne();
        resolve();
      };
      im.src = 'assets/' + path;
    })));
  }

  /* Two phases. The returned promise settles when the OPENING is ready, so
     that is all the film waits for; the remainder is then requested in the
     background, in ASSETS order (which runs roughly in story order), and
     keeps arriving while the viewer is still pointing at the card and
     tapping to start. Nothing is dropped and nothing is fetched twice —
     every key in ASSETS is still loaded, just not all of it up front. */
  function loadImages() {
    const all = Object.keys(C.ASSETS);
    const firstSet = new Set((C.PRELOAD || all).filter(k => C.ASSETS[k]));
    const first = all.filter(k => firstSet.has(k));
    /* the late-story heroes jump the background queue — see PRELOAD_NEXT */
    const nextSet = new Set((C.PRELOAD_NEXT || []).filter(k => C.ASSETS[k] && !firstSet.has(k)));
    const next = all.filter(k => nextSet.has(k));
    const rest = all.filter(k => !firstSet.has(k) && !nextSet.has(k));

    STAGES.forEach(st => st.setImages(IMAGES));

    let done = 0;
    const tick = () => {
      done++;
      el('loader-text').textContent =
        `Loading the story… ${Math.round(done / first.length * 100)}%`;
    };
    /* The percentage tracks the opening set only. That is not a cosmetic
       rescale: the opening set IS what the loading screen is now waiting
       for, so the bar reaches 100% exactly when the film can begin. */
    return loadKeys(first, tick)
      .then(() => { loadKeys(next).then(() => loadKeys(rest)); });
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
    finished: false,       // parked on the last frame, ending buttons showing
    lastDraw: -1,
    drag: 0,               // 0..1 while a gate is open, for the scene to read
    held: false,           // is the clock currently waiting on a gesture?
    waited: 0,

    reset() {
      this.time = START_AT;
      this.lastDraw = -1;
      this.finished = false;
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

    /* keeps the travel card in step with the film, from the same per-frame
       call that already runs the music — no extra loop, no extra listener */
    syncTravel() { if (syncTravel) syncTravel(); if (syncEnding) syncEnding(); },

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
      /* The film used to wrap back to 0 here. It now PARKS on its last frame
         and raises `finished`, because the ending hands over to the REPLAY /
         END AR buttons — an automatic loop would snatch the story back from
         under them. REPLAY calls reset(), which clears this. */
      if (this.time >= RUN) {
        this.time = RUN;
        this.finished = true;
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

  /* ------------------------------------------------- drag to travel ---- */
  /* SCREEN UI, not AR. The card is a plain fixed-position DOM element (see
     #travel in index.html). It is not an a-entity, carries no marker
     transform and is painted by the browser rather than onto any diorama
     canvas, so it holds still on the glass while the film moves with the
     printed card.

     It drives the film through the machinery that was already here rather
     than through a second progression system of its own: the director holds
     the clock at each gate and releases it when `director.drag` reaches 1,
     exactly as the old in-scene gesture did. All this does is set that
     number from a finger on the screen, so Airport -> Seine -> Louvre ->
     Eiffel -> Proposal still advances one gate at a time, in scenes.js's
     order, with DRAG.fallback still covering anyone who never drags. */
  function initTravelUI() {
    const card = el('travel');
    const track = el('travel-track');
    const plane = el('travel-plane');
    const dotWrap = el('travel-dots');
    const instruction = el('travel-instruction');
    const arrow = el('travel-arrow');
    const labels = [...el('travel-labels').children];
    if (!card || !track || !plane) return;
    const landscape = matchMedia('(orientation: landscape)');
    let vertical = landscape.matches;

    const STOPS = labels.length;                 // seine, louvre, eiffel
    /* ONLY the paris gates. GATES holds every gate in the film, and the
       ending scene now adds its own TAP TO KISS hold at the very end — read
       the whole array and one gate is always outstanding, so this card would
       never consider the journey finished and would sit on screen for the
       rest of the story. */
    const legGates = () => GATES.filter(g =>
      TRAVEL_AT && g.at >= TRAVEL_AT.from && g.at < TRAVEL_AT.to);
    /* Fractional position of each stop along the track, plus the plane's
       parking spot at the left before any travelling has happened. */
    const at = i => (i / STOPS) * 100;
    dotWrap.innerHTML = labels.map((_, i) =>
      `<i style="--stop:${at(i + 1)}%"></i>`).join('');
    labels.forEach((label, i) => label.style.setProperty('--stop', at(i + 1) + '%'));
    const dots = [...dotWrap.children];

    let done = 0;          // stops already travelled
    let dragging = false;
    let spent = false;     // this gesture has already spent its one gate
    let pending = false;   // drag finished, waiting for the gate to release
    let waitingAt = null;  // retain completion immediately, including the first gate
    let start = 0;

    /* how far the plane must travel to count, in px of real screen */
    const span = () => track.getBoundingClientRect()[vertical ? 'height' : 'width'] / STOPS;

    const showWaiting = waiting => {
      instruction.textContent = waiting ? 'WAIT FOR PLANE..' : 'DRAG TO TRAVEL';
      arrow.hidden = waiting;
    };

    const paint = (frac = 0) => {
      const base = at(done);
      const pct = base + (at(done + 1) - base) * frac;
      track.style.setProperty('--travel-progress', pct + '%');
      dots.forEach((d, i) => {
        d.classList.toggle('done', i < done);
        d.classList.toggle('next', i === done);
      });
      labels.forEach((l, i) => {
        l.classList.toggle('done', i < done);
        l.classList.toggle('next', i === done);
      });
    };

    /* Called every frame by the director so the card mirrors the film: which
       stop we are on comes from the gates themselves, never from a counter
       kept in here, so the two can never disagree. */
    function sync() {
      if (vertical !== landscape.matches) {
        vertical = landscape.matches;
        // A rotation cancels only an unfinished pull; completed gates stay spent.
        if (dragging) {
          dragging = false;
          director.drag = 0;
          card.classList.remove('dragging');
        }
        paint(0);
      }
      /* Release the instruction only at the next gate, or on replay.
         It must not depend on the director acknowledging the drag first. */
      if (waitingAt !== null && (director.time < waitingAt ||
          (director.held && director.time > waitingAt))) waitingAt = null;
      const inParis = TRAVEL_AT &&
        director.time >= TRAVEL_AT.from && director.time < TRAVEL_AT.to;
      /* Keep the final wait instruction through the existing arrival:
         .03s from gate to destination, .50s slide, then .15s settle.
         This only controls the card; the cinematic clock is unchanged. */
      const travelling = legGates().some(g => !g.done);
      const lastGate = legGates()[STOPS - 1];
      const arriving = lastGate && lastGate.done &&
        director.time < lastGate.at + .03 + .50 + .15;
      card.hidden = !inParis || !(travelling || arriving);
      if (card.hidden) return;
      const d = legGates().filter(g => g.done).length;
      /* `pending` closes a race: a completed drag moves the plane onto its
         new stop immediately, but the director only marks the gate done on
         its next advance(). Without this the count read here would be one
         behind for those few frames and would snap the plane back to the
         stop it had just left. */
      if (pending && d >= done) pending = false;
      if (!pending && d !== done && !dragging) { done = Math.min(d, STOPS); paint(0); }
      card.classList.toggle('ready', !!director.held);
      showWaiting(waitingAt !== null || pending || (d > 0 && !director.held));
    }

    const down = e => {
      sync();
      if (!director.held || done >= STOPS) return;   // only while a gate waits
      /* Forgiving: anywhere on the card's track starts the drag, not just
         the plane's own few pixels. */
      dragging = true;
      spent = false;
      start = vertical ? e.clientY : e.clientX;
      card.classList.add('dragging');
      /* Unchanged audio behaviour: this is still the gesture that buys
         playback permission, exactly as the in-scene drag did. */
      if (music) music.bless();
      director.drag = 0;
      if (plane.setPointerCapture && e.pointerId != null) {
        try { plane.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      }
    };

    const move = e => {
      if (!dragging || spent) return;
      const distance = (vertical ? e.clientY : e.clientX) - start;
      if (distance <= 0) { director.drag = 0; paint(0); return; }
      const frac = Math.min(1, distance / span());
      director.drag = frac;
      paint(frac);
      if (frac >= 1) {
        /* One gesture, one destination: the finger staying down cannot roll
           straight on into the next stop. */
        spent = true;
        dragging = false;
        pending = true;                // gate releases on the next advance()
        waitingAt = director.time;
        showWaiting(true);
        card.classList.remove('dragging');
        done = Math.min(done + 1, STOPS);
        paint(0);                      // settle onto the stop just reached
      }
    };

    const up = () => {
      if (!dragging && !spent) return;
      if (dragging && music) music.bless();   // Safari grants best on touch end
      if (!spent) { director.drag = 0; paint(0); }   // short pull springs back
      dragging = false;
      card.classList.remove('dragging');
    };

    const opt = { passive: true };
    /* The WHOLE CARD is the handle, not the 40px track and not the plane's
       own few pixels. A thumb that lands on the title, on a label, or just
       above or below the line still starts the journey — which is the
       difference between an interaction that works on a phone and one that
       needs a pixel-perfect press. (My own test rig missed the track by a
       few pixels on the last leg and the drag silently did nothing; a real
       thumb would have done the same.) */
    card.addEventListener('pointerdown', down, opt);
    addEventListener('pointermove', move, opt);
    addEventListener('pointerup', up, opt);
    addEventListener('pointercancel', up, opt);

    paint(0);
    return sync;
  }
  let syncTravel = null;

  /* ------------------------------------------------- ending controls ---- */
  /* SCREEN UI, on the same footing as the travel card: fixed to the
     viewport, no marker transform, not painted onto any diorama canvas.

     TAP TO KISS releases the ending scene's one gate through the very same
     `director.drag` the travel card uses, so there is no second interaction
     system and no second progression system — the scene simply advances past
     EN_KISS_T and draws ending_2 instead of ending_1. */
  const ENDING_AT = (() => {
    const i = SCENES.findIndex(s => s.id === 'ending');
    if (i < 0) return null;
    if (ONLY) return ONLY === 'ending' ? { from: 0, to: SCENES[i].dur } : null;
    const from = SCENES.slice(0, i).reduce((a, s) => a + s.dur, 0);
    return { from, to: from + SCENES[i].dur };
  })();

  let restartAR = null;      // set by buildScene so REPLAY can reset its state
  let ended = false;

  function initEndingUI() {
    const wrap = el('ending-ui');
    const kiss = el('btn-kiss');
    const finalRow = el('ending-final');
    if (!wrap || !kiss || !finalRow) return null;

    let spent = false;       // this tap has already released the gate

    kiss.addEventListener('click', () => {
      if (spent || !director.held) return;
      spent = true;
      if (music) music.bless();     // same gesture-to-gate path as the drag
      director.drag = 1;
    }, { passive: true });

    el('btn-replay').addEventListener('click', () => {
      spent = false;
      ended = false;
      /* Hide the controls on the spot rather than waiting for the next
         frame's syncEnding(), so the restart never flashes them. */
      kiss.hidden = true;
      finalRow.hidden = true;
      wrap.hidden = true;
      director.reset();             // clock, gates, finished flag, audio
      if (restartAR) restartAR();   // back to "tap to begin", as on first run
      else director.play();         // preview has no marker to wait for
    }, { passive: true });

    el('btn-end').addEventListener('click', endAR, { passive: true });

    return function syncEnding() {
      if (ended) return;
      const inEnding = ENDING_AT &&
        director.time >= ENDING_AT.from && director.time < ENDING_AT.to;
      const wantKiss = inEnding && director.held && !director.finished;
      const wantFinal = !!director.finished;
      kiss.hidden = !wantKiss;
      finalRow.hidden = !wantFinal;
      wrap.hidden = !(wantKiss || wantFinal);
      if (!director.held) spent = false;    // armed again for a replay
    };
  }
  let syncEnding = null;

  /* END AR — stop the film, drop the camera, hide every control, and leave
     the viewer on a still, stable screen. No navigation, no reload. */
  function endAR() {
    if (ended) return;
    ended = true;
    director.pause();
    if (music) music.stop();
    el('ending-ui').hidden = true;
    el('btn-kiss').hidden = true;
    el('ending-final').hidden = true;
    const tv = el('travel'); if (tv) tv.hidden = true;
    document.querySelectorAll('video').forEach(v => {
      const st = v.srcObject;
      if (st && st.getTracks) st.getTracks().forEach(tr => tr.stop());
      v.srcObject = null;
      try { v.pause(); } catch (e) { /* already stopped */ }
    });
    const root = el('ar-root');
    if (root) root.hidden = true;
    document.body.classList.add('ended');
    const t = el('hint-title'), sub = el('hint-sub');
    if (t && sub) {
      t.textContent = 'Rahul & Arya';
      sub.textContent = 'Thank you for celebrating with us.';
      el('hint').hidden = false;
    }
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
    playStartSound();
    syncTravel = initTravelUI();
    syncEnding = initEndingUI();
    let last = performance.now();
    const loop = now => {
      director.advance(Math.min(.1, (now - last) / 1000));
      last = now;
      director.syncMusic(); director.syncTravel();
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
    /* REPLAY restarts the story from the very beginning, which means the AR
       flow goes back to waiting for the viewer's tap exactly as it did the
       first time — same hint, same gate on `started`. */
    restartAR = () => {
      started = false;
      if (director.found) showTapHint(); else showPointHint();
      syncPlaying();
    };

    function showTapHint() {
      hintTitle.textContent = `${C.GROOM} & ${C.BRIDE}'S STORY`;
      hintSub.textContent = 'ROTATE YOUR PHONE FOR A BETTER EXPERIENCE';
      el('hint').classList.add('start-card');
      el('btn-begin').hidden = false;
      el('btn-begin').disabled = !director.found;
      el('hint-volume').hidden = false;
      el('hint').hidden = false;
    }
    function showPointHint() {
      el('hint').classList.remove('start-card');
      el('btn-begin').hidden = true;
      el('hint-volume').hidden = true;
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
        if (!started) {
          /* Keep the opaque title steady while rotation briefly loses the
             marker. The existing start gate still requires reacquisition. */
          if (el('hint').classList.contains('start-card')) showTapHint();
          else showPointHint();
        }
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
      /* Buy the browser's permission to play audio here, on the tap that
         starts the film. This is not a new interaction — it is the tap the
         viewer already has to make, and the film cannot begin without it, so
         by the time the sangeet arrives the permission is always in hand.

         The airport drag still blesses too, but it could not be relied on by
         itself: a viewer who never drags is carried past the gate by
         DRAG.fallback, and nothing else on a phone ever grants playback.
         Desktop hid this, because Chrome gives a page document-wide
         activation from any stray click — which is exactly why
         celebrations.mp3 played there and stayed silent on the handset.

         A click is also the gesture Safari honours most reliably, and
         bless() is idempotent and silent (a muted play/pause), so nothing is
         heard here and nothing starts early. */
      if (music) music.bless();
      /* Request on this same click, before starting the story. Fullscreen
         consumes activation, so preserve the audio unlock above it.
         Fullscreen the page so camera video, AR and screen UI stay together.
         Do not await: rejection or unsupported browsers must not hold the film. */
      const page = document.documentElement;
      if (!document.fullscreenElement && typeof page.requestFullscreen === 'function') {
        try {
          const request = page.requestFullscreen({ navigationUI: 'hide' });
          if (request && request.catch) request.catch(() => {});
        } catch (err) { /* Continue the existing experience without fullscreen. */ }
      }
      el('hint').hidden = true;
      el('hint').classList.remove('start-card');
      el('btn-begin').hidden = true;
      el('hint-volume').hidden = true;
      playStartSound();
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
        /* ...plus MARKER.frameLift, which lifts the whole diorama so the
           lower band of every panel clears the bottom of the phone frame.
           See the note in config.js — this is tilt framing, not a fix for
           any scene's coordinates, and it is AR-only because this component
           is never constructed in ?preview. */
        group.position.set(0,
          this.zoom * (h / 2) * Math.cos(tilt)
            + m.height * 0.05
            + this.zoom * h * (m.frameLift || 0), 0);
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

      syncViewport() {
        const scene = this.el.sceneEl;
        const session = scene.systems.arjs && scene.systems.arjs._arSession;
        if (!session || !session.arContext.arController) return;
        const source = session.arSource;
        const video = source.domElement;
        if (!source.ready || !video.videoWidth || !video.videoHeight) return;

        /* Camera frame dimensions can change after the window rotates.
           Refresh them before copying sizes, not one AR.js tick later. */
        source.onResizeElement();
        const context = session.arContext;
        const controller = context.arController;
        const orientation = video.videoWidth > video.videoHeight ? 'landscape' : 'portrait';
        const screenOrientation = window.screen && window.screen.orientation;
        const angle = screenOrientation ? screenOrientation.angle : (window.orientation || 0);
        const frame = `${video.videoWidth}x${video.videoHeight}:${angle}`;
        if (controller.orientation !== orientation ||
            (this.cameraFrame !== undefined && this.cameraFrame !== frame)) {
          /* AR.js 3.4.5 sets these only at camera startup. Old smoothing
             matrices and continuous-pose seeds belong to the old image axes. */
          controller.orientation = controller.options.orientation = orientation;
          context._arMarkersControls.forEach(control => {
            if (control.smoothMatrices) control.smoothMatrices.length = 0;
          });
          for (const bank of [controller.patternMarkers, controller.barcodeMarkers]) {
            Object.values(bank).forEach(marker => {
              marker.inCurrent = marker.inPrevious = false;
            });
          }
          context._updatedAt = null;   // process a fresh pose on this frame
        }
        this.cameraFrame = frame;

        /* AR.js sizes its calibrated display area (including portrait
           padding) through copyElementSizeTo. Its body resize cannot reach
           our fixed #ar-root, so the embedded canvas otherwise squeezes a
           landscape projection into the phone's portrait rectangle.
           Match the AR root to that same area; leave screen UI untouched. */
        const root = el('ar-root');
        source.copyElementSizeTo(root);
        /* During rotation the viewport can turn before the camera image.
           Keep portrait camera padding until the actual video turns too. */
        if (orientation === 'portrait') {
          const width = parseFloat(video.style.height) *
            controller.canvas.width / controller.canvas.height;
          root.style.width = width + 'px';
          root.style.marginLeft = (innerWidth - width) / 2 + 'px';
          root.style.marginTop = video.style.marginTop;
        }
        const size = root.style.width + 'x' + root.style.height;
        if (size !== this.viewportSize) {
          this.viewportSize = size;
          scene.resize();
          /* resize() sets an ordinary perspective projection. Restore the
             tracking calibration immediately, as AR.js also does per tick. */
          scene.camera.projectionMatrix.copy(session.arContext.getProjectionMatrix());
          scene.camera.projectionMatrixInverse.copy(scene.camera.projectionMatrix).invert();
        }
      },

      tick() {
        // Also handles fullscreen entry/exit as the browser changes viewport size.
        this.syncViewport();
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
          director.syncMusic(); director.syncTravel();          // card away: the music waits with the film
          return;
        }
        director.advance(dt);
        director.syncMusic(); director.syncTravel();
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
    await Promise.all([loadImages(), loadFonts()]);
    /* Buffer the music now, not at 67.8s — but only once the images/fonts
       gate above has cleared, not before it. This file alone is ~8MB; primed
       any earlier it competes with ~100MB of artwork for the same mobile
       connection during the one phase the loading screen is actually
       tracking, which is a large, needless part of why that screen sits at
       the same percentage for a long time on a phone. The celebrations
       scene it is for is still tens of seconds away from here either way. */
    if (music) music.prime();
    /* AR starts with empty textures under the title card. Scene 1's first
       frame is drawn only after the existing start tap releases playback. */
    if (PREVIEW) {
      /* Same reasoning, much smaller file: buffered now so the tap (or, in
       preview, the load itself) can play it with no fetch delay. */
    if (startSound && startSound.load) startSound.load();
    director.draw();
      return startPreview('requested');
    }

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
    syncTravel = initTravelUI();
    syncEnding = initEndingUI();

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
