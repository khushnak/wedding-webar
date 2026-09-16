/* ==========================================================================
   SCENES — the storyboard, one function per scene.

   Each scene gets (g, t) where g is the Stage and t is seconds *inside* that
   scene. Scenes are listed at the bottom in story order; lengths come from
   CONFIG.SCENE_SECONDS so you can retime anything without touching the code.

   Reading the beats: numbers in the left column of each block are seconds.
   ========================================================================== */

const SCENES = (() => {

  const C = CONFIG;
  const P = C.PALETTE;
  const GY = C.STAGE.groundY;
  const CX = C.STAGE.logicalW / 2;
  const { clamp, lerp, ease, p, pl, on, life, q, hops, bob } = E;

  /* Deterministic pseudo-random so confetti looks scattered but never jitters. */
  const rnd = i => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  /* Scene 1 only — a paper cutout repositioned by hand between static
     holds, not a slide. Measured against the reference clip
     (assets/reference/Video-310.mp4): every position change there is a
     single-frame, effectively-instant snap (~0.04s), separated by holds
     that average ~0.3s (range .08-.5s) — almost none of the runtime is
     spent "in transit". So this is a lookup over a handful of authored,
     fixed poses (position fraction of the from->to journey + a small
     fixed tilt for that pose), not a continuous/eased path — even a
     time-quantised continuous path (STAGE.choppy) still traces the same
     journey with visible intermediate positions, which is exactly the
     "sliding" look this replaces. Once the last pose is reached it is
     permanent — hard stop, no idle motion.
     Deliberately separate from the shared `hops()` bounce used elsewhere
     (college, paris) so those scenes are unaffected. */
  const CUTOUT_POSES = [
    { frac: 0, rot: 0 },     // off-screen, not yet arrived
    { frac: .45, rot: 3 },   // 1st snap: lands well onto the frame, tiny tilt
    { frac: .8, rot: -3 },   // 2nd snap: near-final, tilts back the other way
    { frac: 1, rot: 0 },     // 3rd snap: settles flat — permanent from here on
  ];
  /* Which authored pose the cutout is on right now. Kept separate from
     slideIn because some callers need the raw 0..1 journey fraction as a
     number rather than a screen position — Scene 4 drives the walk-up-the
     -road y/height ramp from it, and Scene 6 moves the suitcases with it. */
  const cutoutIdx = (t, t0, holdDur) => {
    const lt = t - t0;
    return lt < 0 ? 0 : Math.min(CUTOUT_POSES.length - 1, 1 + Math.floor(lt / holdDur));
  };
  const cutoutFrac = (t, t0, holdDur) => CUTOUT_POSES[cutoutIdx(t, t0, holdDur)].frac;

  /* Pure lookup: the position and tilt come only from the authored poses
     above. Once the last one is reached the cutout is set down and stays
     exactly where it is — no drift, no jitter, nothing running underneath
     — until the next deliberate move or pose swap. */
  const slideIn = (t, t0, holdDur, from, to) => {
    const pose = CUTOUT_POSES[cutoutIdx(t, t0, holdDur)];
    return { x: lerp(from, to, pose.frac), rot: pose.rot };
  };

  /* Scene 1 (garden + Rahul/Arya intros) was authored in a 1000x1500
     portrait space. The stage is now the garden art's native 1672x941
     landscape frame, so every Scene 1 x/y/size below carries its original
     authored number scaled by these factors, rather than being redesigned:
     x-positions and horizontal lengths x SX, y-positions and vertical
     lengths/sizes (heights, font sizes, radii, line widths) x SY. */
  const SX = C.STAGE.logicalW / 1000;
  const SY = C.STAGE.logicalH / 1500;

  /* Scene 1 timeline anchors, shared between meetRahul and meetArya so
     nothing here has to be re-derived or hardcoded twice. Each stage is
     defined relative to the one before it so retiming one thing cascades
     correctly, matching how CONFIG.SCENE_SECONDS already works. */
  /* The rises stay gentle and eased — only their durations came down, so
     the environment still unfolds rather than snapping up like the
     characters do. */
  /* The three layers OVERLAP rather than queue. Each rise keeps its own
     unhurried pace — the movement itself is not sped up — but the next
     layer sets off GARDEN_LAP before the one under it has finished
     settling, so the whole thing reads as one coordinated upward reveal
     instead of three animations waiting their turn. That is where the
     time was going: the old build spent 0.60s of its 2.50s simply holding
     still between layers. */
  const GARDEN_L1_T0 = 0, GARDEN_L1_DUR = .75;
  const GARDEN_LAP = .10;                  // next layer starts this early
  const GARDEN_SETTLE = .30;               // after the last layer, before anyone enters
  const GARDEN_L2_T0 = GARDEN_L1_T0 + GARDEN_L1_DUR - GARDEN_LAP, GARDEN_L2_DUR = .6;   // 0.65
  const GARDEN_L3_T0 = GARDEN_L2_T0 + GARDEN_L2_DUR - GARDEN_LAP, GARDEN_L3_DUR = .55;  // 1.15
  const RAHUL_ENTER_T0 = GARDEN_L3_T0 + GARDEN_L3_DUR + GARDEN_SETTLE;                  // 2.00

  const CUTOUT_HOLD = .6;                                              // per-snap hold, both characters
  const RAHUL_SETTLE_T0 = RAHUL_ENTER_T0 + 2 * CUTOUT_HOLD;            // 4.0
  const RAHUL_TAG1_T0 = RAHUL_SETTLE_T0 + .5;                          // 4.5
  const RAHUL_TAG2_T0 = RAHUL_TAG1_T0 + 1.0;                           // 5.5
  const RAHUL_TITLE_T0 = RAHUL_TAG2_T0 + .6;                           // 6.1 — pose swap happens here too
  const RAHUL_NAME_T0 = RAHUL_TITLE_T0 + .35;                          // 6.45
  const RAHUL_ICONS_T0 = RAHUL_TITLE_T0 + 1.3, ICON_GAP = .45;         // 7.4
  const BUBBLE_T0 = RAHUL_ICONS_T0 + 3 * ICON_GAP + .75;               // 9.5
  const POP_T0 = BUBBLE_T0 + .3;                                       // 9.8
  const PLANE_ARC_T0 = POP_T0 + .2, PLANE_ARC_DUR = .8;                // 10.0
  const PLANE_CRUISE_T0 = PLANE_ARC_T0 + PLANE_ARC_DUR;                // 10.8

  /* Both characters render large enough to be the clear focal point
     against the landscape (~62% of the frame's height) instead of a small
     figure standing in it — unchanged from the last pass. */
  const CHAR_H = 580;
  /* Where each of them comes to rest — the single source of truth for
     both the cutout's own final position and where its hobby icons /
     airplane bubble are anchored, so those always hug the actual body
     instead of drifting from it if this number is ever retuned. */
  const RAHUL_X = 480 * SX, ARYA_X = 520 * SX;
  /* The title block has to live entirely in the band between the top of
     the frame and the top of the character's head (GY - CHAR_H = 160),
     which is only ~160px tall — so the two lines are sized to actually
     fit it with air above, between, and below, instead of being clipped
     by the frame or landing on the character's hair. Baselines, so the
     name's ink ends at NAME_Y (it is all caps, no descenders). */
  const TITLE_Y = 62, TITLE_SIZE = 68 * SY;
  const NAME_Y = 152, NAME_SIZE = 140 * SY;
  /* The hobby PNGs already render as a finished glass-bubble badge of
     their own — no extra circle wrapper needed (see the removed
     iconBadge() calls below), just this display size. */
  const HOBBY_ICON_SIZE = 128;
  /* Trait labels sit deliberately between the name (158*SY) and the
     handwritten caption (76*SY): clearly readable at phone/AR distance
     without competing with RAHUL / ARYA. */
  const TRAIT_SIZE = 88 * SY;

  /* Four hobby spots hugging the character's own silhouette — a lower
     pair near hip height, an upper pair near shoulder height — instead of
     scattered far off to the sides. Order: lower-left, lower-right,
     upper-left, upper-right. The last (upper-right) is always the
     "travel" spot: it doubles as the airplane bubble's launch point. */
  const constellationSpots = cx => [
    { x: cx - 300, y: GY - 150 },
    { x: cx + 300, y: GY - 150 },
    { x: cx - 260, y: GY - 480 },
    { x: cx + 260, y: GY - 480 },
  ];

  const PLANE_P0 = constellationSpots(RAHUL_X)[3];          // launches from the travel bubble spot
  const PLANE_ARC_CP = { x: PLANE_P0.x + 90, y: PLANE_P0.y - 140 };
  const PLANE_ARC_END = { x: PLANE_P0.x + 220, y: PLANE_P0.y - 170 };

  /* Cruise speed once the camera has released. This is a straight,
     constant-velocity segment — no easing of any kind reaches it — but at
     the old 75px/s it covered the remaining 460px of frame in six
     seconds, which reads as the plane grinding to a halt rather than
     flying away. At 154px/s it keeps a steady, visible clip all the way
     off the edge. */
  const PLANE_SLOW_V = 154;
  const CAM_PAN_T0 = PLANE_CRUISE_T0, CAM_LOCK_DUR = 1.15;
  const CAM_RELEASE_T = CAM_PAN_T0 + CAM_LOCK_DUR;          // 13.35
  const CAM_FINAL = 1210;                      // total pan distance during the lock window

  /* A broad, gentle curve for the whole camera-tracked cruise, replacing
     the old constant-velocity straight line: CRUISE_CP sits above the
     straight ARC_END->CRUISE_END line, so the quadratic bezier bulges
     gently upward through the middle of the pan, then eases back down
     onto a shallow rightward heading — "slight curve, gentle change of
     direction, continue" rather than a ruler-straight diagonal or a
     rollercoaster. Because camX (below) is still defined as exactly
     planeWorldX(tg) - planeWorldX(CAM_PAN_T0), the camera is
     mathematically guaranteed to track this curve exactly, whatever its
     shape — the screen-locked-x invariant doesn't depend on the path
     being a straight line. */
  const CRUISE_RISE = 50;
  const CRUISE_END = { x: PLANE_ARC_END.x + CAM_FINAL, y: PLANE_ARC_END.y - CRUISE_RISE };
  const CRUISE_CP = {
    x: (PLANE_ARC_END.x + CRUISE_END.x) / 2 + 40,
    y: (PLANE_ARC_END.y + CRUISE_END.y) / 2 - 45,
  };

  /* The three garden PNGs are NOT three versions of one picture, and that
     distinction drives everything below. gardenBg is the whole opaque
     landscape (sky, mountains, lake, grass, edge to edge). gardenMid and
     gardenFg are transparent corner VIGNETTES — foliage in the
     bottom-left and bottom-right corners with nothing at all in between.
     So the camera pan has to treat them as opposites:

       - the landscape IS the world, so it physically extends: copies at
         natural size (never stretched), each overlapping the previous one
         by GARDEN_FADE and dissolved in across that overlap, so a join
         reads as more landscape instead of a hard edge.
       - the vignettes are framing, not scenery, so they stay pinned to
         the viewport and frame whatever part of the world is on screen.
         Tiling them edge to edge is what put a mirrored double-bush in
         the middle of the frame during the transition: one copy's
         right-corner foliage landing directly against the next copy's
         left-corner foliage. */
  const GARDEN_FADE = 420;                                // width of each cross-faded join
  const GARDEN_STRIDE = C.STAGE.logicalW - GARDEN_FADE;   // consecutive copies overlap by GARDEN_FADE
  const GARDEN_COPIES = Math.ceil(CAM_FINAL / GARDEN_STRIDE) + 2;

  const quadPt = (p0, cp, p1, u) => {
    const v = 1 - u;
    return { x: v * v * p0.x + 2 * v * u * cp.x + u * u * p1.x, y: v * v * p0.y + 2 * v * u * cp.y + u * u * p1.y };
  };

  /* The exit heading of the cruise curve (its tangent at u=1), so the
     slow drift after the camera releases continues in the same direction
     the bezier above was already heading, instead of snapping onto some
     unrelated straight line. */
  const EXIT_DIR = (() => {
    const dx = CRUISE_END.x - CRUISE_CP.x, dy = CRUISE_END.y - CRUISE_CP.y;
    const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  })();

  /* World-space x/y of the airplane once it's past the initial arc: the
     curved, camera-locked bezier while the camera is tracking it (see
     camX below), then a straight leisurely drift along the curve's own
     exit heading once released. Both segments use a plain linear time
     fraction (no ease.out/inOut/etc) for `u` — the initial takeoff arc is
     allowed to ease, but once the plane reaches its cruise it must hold a
     constant, un-decelerating velocity the whole way to when it leaves
     the frame, including through the Rahul -> Arya cut. */
  const planeWorldPos = tg => {
    if (tg <= PLANE_CRUISE_T0) return { x: PLANE_ARC_END.x, y: PLANE_ARC_END.y };
    if (tg <= CAM_RELEASE_T) {
      const u = clamp((tg - PLANE_CRUISE_T0) / CAM_LOCK_DUR);
      return quadPt(PLANE_ARC_END, CRUISE_CP, CRUISE_END, u);
    }
    const d = PLANE_SLOW_V * (tg - CAM_RELEASE_T);
    return { x: CRUISE_END.x + EXIT_DIR.x * d, y: CRUISE_END.y + EXIT_DIR.y * d };
  };
  const planeWorldX = tg => planeWorldPos(tg).x;
  const planeWorldY = tg => planeWorldPos(tg).y;

  /* tg = global story time (meetRahul's own t; meetArya must add its own
     scene's start offset before calling this — see meetArya). Position is
     always in WORLD space (pre-camera-pan); callers subtract camX/CAM_FINAL
     to get the on-screen position — see meetRahul/meetArya. */
  const planeHead = tg => {
    if (tg < PLANE_CRUISE_T0) {
      const u = ease.out(clamp((tg - PLANE_ARC_T0) / PLANE_ARC_DUR));
      const pos = quadPt(PLANE_P0, PLANE_ARC_CP, PLANE_ARC_END, u);
      const prev = quadPt(PLANE_P0, PLANE_ARC_CP, PLANE_ARC_END, Math.max(0, u - .02));
      return { x: pos.x, y: pos.y, angle: Math.atan2(pos.y - prev.y, pos.x - prev.x) * 180 / Math.PI, arcDone: u >= 1 };
    }
    const x = planeWorldX(tg), y = planeWorldY(tg);
    const px = planeWorldX(tg - .05), py = planeWorldY(tg - .05);
    return { x, y, angle: Math.atan2(y - py, x - px) * 180 / Math.PI, arcDone: true };
  };

  /* The 2D "camera": a pure compositional translate applied inside the
     existing canvas (the AR plane/marker/texture pipeline in main.js is
     untouched — this only shifts WHERE things are drawn within the same
     texture). Locked-tracking, not an independent pan: during
     [CAM_PAN_T0, CAM_RELEASE_T], camX is defined as
     planeWorldX(tg) - planeWorldX(CAM_PAN_T0), which makes the airplane's
     ON-SCREEN x provably constant for that whole window (screenX =
     worldX - camX = planeWorldX(CAM_PAN_T0), a constant) regardless of
     whatever shape planeWorldX itself traces — including the curved path
     above — so the camera cannot outpace, reverse, or fall out of sync
     with the thing it's tracking. After release, camX freezes and the
     plane resumes visible motion in the now-settled frame. */
  const camX = tg => {
    if (tg < CAM_PAN_T0) return 0;
    if (tg < CAM_RELEASE_T) return planeWorldX(tg) - planeWorldX(CAM_PAN_T0);
    return CAM_FINAL;
  };

  /* ---------------------------------------------------------- backdrops --- */

  /* One continuous landscape, drawn in WORLD space: GARDEN_COPIES copies
     of the backdrop at its natural size, each overlapping the previous by
     GARDEN_FADE and dissolved in across that overlap. The dissolve is a
     run of thin vertical slices with a rising alpha, because canvas has
     no gradient-masked drawImage. Nothing is ever scaled or stretched, so
     the artwork keeps exactly the proportions it was drawn at. */
  const GARDEN_FADE_SLICES = 32;
  function gardenLandscape(g, y, w, h) {
    const fade = GARDEN_FADE / w;                 // the join, as a fraction of the source image
    for (let i = 0; i < GARDEN_COPIES; i++) {
      const left = i * GARDEN_STRIDE;
      if (i === 0) {
        g.sprite('gardenBg', { x: left + w / 2, y, w, h, anchor: 'center' });
        continue;
      }
      /* Slices abut exactly rather than overlapping: two overlapping
         part-transparent slices composite twice and leave a visible line
         at every boundary. A hairline gap is harmless here instead —
         what shows through it is the previous copy, i.e. more landscape. */
      const sw = fade / GARDEN_FADE_SLICES;
      for (let s = 0; s < GARDEN_FADE_SLICES; s++) {
        const f0 = s * sw;
        g.spriteCrop('gardenBg', f0, 0, sw, 1, {
          x: left + (f0 + sw / 2) * w, y, w: sw * w, h, anchor: 'center',
          alpha: (s + 1) / GARDEN_FADE_SLICES,
        });
      }
      g.spriteCrop('gardenBg', fade, 0, 1 - fade, 1, {
        x: left + (fade + (1 - fade) / 2) * w, y, w: (1 - fade) * w, h, anchor: 'center',
      });
    }
  }

  /* The corner vignettes, drawn OUTSIDE the camera translate so they stay
     pinned to the viewport and frame whichever stretch of landscape is on
     screen — identically on Rahul's side, mid-transition, and on Arya's
     side. See the note on GARDEN_FADE above for why these must not tile. */
  function gardenVignette(g, key, y) {
    g.sprite(key, { x: CX, y, w: C.STAGE.logicalW, h: C.STAGE.logicalH, anchor: 'center' });
  }

  /* Belt-and-suspenders backstop: a plain sky-colour fill spanning the
     whole landscape range, drawn first so it sits invisibly behind the
     copies whenever they line up correctly (the normal case) — but
     guarantees the camera can never expose bare/transparent canvas. */
  function gardenSafetyFill(g) {
    if (!g.on('background')) return;   // sky belongs on the back panel only
    g.ctx.save();
    g.ctx.fillStyle = P.sky;
    g.ctx.fillRect(-C.STAGE.logicalW, 0, GARDEN_COPIES * GARDEN_STRIDE + 3 * C.STAGE.logicalW, C.STAGE.logicalH);
    g.ctx.restore();
  }

  function garden(g, t, alpha = 1) {
    if (alpha <= 0) return;
    g.ground(GY, { alpha: alpha * .9, w: 600 * SX, h: 150 * SY, fill: 'rgba(47,90,67,0.14)' });

    const f1 = life(t, .1, 999, .5, 0);
    g.sprite('flowers', { x: 150 * SX, y: GY + 130 * SY, h: 240 * f1 * SY, alpha: alpha, rot: -4 });
    const f2 = life(t, .35, 999, .5, 0);
    g.sprite('flowers', { x: 880 * SX, y: GY + 155 * SY, h: 200 * f2 * SY, alpha: alpha, flip: true, rot: 5 });

    const b1 = life(t, .7, 999, .6, 0);
    g.sprite('butterflies', {
      x: 800 * SX + bob(t, .14, 16 * SX), y: 360 * SY + bob(t, .19, 22 * SY, .3),
      h: 150 * b1 * SY, alpha: alpha, rot: bob(t, .17, 5),
    });
    const b2 = life(t, 1.1, 999, .6, 0);
    g.sprite('butterflies', {
      x: 175 * SX + bob(t, .12, 14 * SX, .5), y: 300 * SY + bob(t, .16, 18 * SY),
      h: 105 * b2 * SY, alpha: alpha * .95, flip: true, rot: bob(t, .13, 6, .4),
    });
  }

  function collegeBG(g, t, rise = 1, alpha = 1) {
    if (alpha <= 0) return;
    // two soft clouds, drifting — sky dressing, so the back panel
    if (g.on('background')) {
      g.ctx.save();
      g.ctx.globalAlpha = alpha * .85;
      g.ctx.fillStyle = '#ffffff';
      [[230, 330, 78], [760, 260, 62], [620, 400, 44]].forEach((c, i) => {
        const dx = ((t * (6 + i * 3)) % 260) - 60;
        g.ctx.beginPath();
        g.ctx.ellipse(c[0] + dx, c[1], c[2] * 1.7, c[2], 0, 0, 6.2832);
        g.ctx.ellipse(c[0] + dx - c[2], c[1] + c[2] * .3, c[2] * .9, c[2] * .68, 0, 0, 6.2832);
        g.ctx.ellipse(c[0] + dx + c[2] * 1.1, c[1] + c[2] * .25, c[2] * .8, c[2] * .6, 0, 0, 6.2832);
        g.ctx.fill();
      });
      g.ctx.restore();
    }

    g.ground(GY, { alpha: alpha * .9, w: 640, h: 150, fill: 'rgba(47,90,67,0.13)' });
    g.sprite('college', {
      x: CX, y: GY + 40 + (1 - rise) * 420, h: 520, alpha: alpha,
    });
  }

  /* --------------------------------------------------- 1. meet the groom --- */

  function meetRahul(g, t) {
    /* The 2D "camera": a pure translate of everything drawn below. Zero
       until the airplane transition begins (~16.1s), then pans — see
       camX's own comment above for how this avoids ever visually
       reversing relative to the airplane it tracks. The AR marker/plane
       are completely unaffected; this only shifts where things land on
       the same texture. */
    const cam = camX(t);
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    /* Layer 1 — the landscape itself, in WORLD space so it travels past
       the viewer during the camera pan. Rises gently, then HOLDS
       completely still for a real, perceptible pause before Layer 2
       begins — the world unfolds one layer at a time rather than at once. */
    g.ctx.save();
    g.ctx.translate(-cam, 0);
    gardenSafetyFill(g);
    const bg1 = p(t, GARDEN_L1_T0, GARDEN_L1_DUR, ease.out);
    gardenLandscape(g, bgH / 2 + (1 - bg1) * 620 * SY, bgW, bgH);
    garden(g, t);
    g.ctx.restore();

    /* Layer 2 — midground vignette. Same gentle rise, only starting once
       Layer 1 has fully risen AND held; pinned to the viewport (see
       gardenVignette) rather than tiled across the world. */
    const bg2 = p(t, GARDEN_L2_T0, GARDEN_L2_DUR, ease.out);
    gardenVignette(g, 'gardenMid', bgH / 2 + (1 - bg2) * 560 * SY);

    /* Rahul: a paper cutout snapped into place twice (see slideIn /
       CUTOUT_POSES) — holding fully static in between and forever after —
       only beginning once all three garden layers have risen and held.
       In world space, so the camera genuinely leaves him behind. */
    g.ctx.save();
    g.ctx.translate(-cam, 0);
    const slide = slideIn(t, RAHUL_ENTER_T0, CUTOUT_HOLD, -180 * SX, RAHUL_X);
    const pose = t < RAHUL_TITLE_T0 ? 'rahulIntro' : 'rahulPose';  // instant stop-motion pose swap, no crossfade

    g.shadow(slide.x, GY + 6 * SY, 90 * SY, 1);
    g.sprite(pose, { x: slide.x, y: GY, h: CHAR_H, rot: slide.rot });
    g.ctx.restore();

    /* Layer 3 — foreground vignette, drawn after the character so its
       flowers sit in front of him; only starts once Layer 2 has risen and
       held. Pinned to the viewport, like Layer 2. */
    const bg3 = p(t, GARDEN_L3_T0, GARDEN_L3_DUR, ease.out);
    gardenVignette(g, 'gardenFg', bgH / 2 + (1 - bg3) * 500 * SY);

    /* everything from here belongs to Rahul's own patch of the world, so
       it pans away with him */
    g.ctx.save();
    g.ctx.translate(-cam, 0);

    /* trait tags, after a beat of hold once he's settled — sized to read
       at arm's length on a phone, clearly the middle of the hierarchy
       (name > traits > icons > handwritten caption), and placed out past
       the hobby constellation so they clear his silhouette. */
    const tag = (txt, t0, x, y, rot) => {
      const l = life(t, t0, 1.5, .26, .3);
      if (l <= 0) return;
      g.rays(x, y, { alpha: l * .5, count: 5, r0: TRAIT_SIZE * 1.15, r1: TRAIT_SIZE * 1.6, lw: 7 * SY, rot: 20, color: P.marigold });
      g.text(txt, {
        x, y, size: TRAIT_SIZE, color: P.chilli, rot, scale: l,
        outline: 15 * SY, ls: 2 * SY, alpha: clamp(l * 1.4),
      });
    };
    tag(C.GROOM_TRAITS[0], RAHUL_TAG1_T0, 312, 300, -7);
    tag(C.GROOM_TRAITS[1], RAHUL_TAG2_T0, 1358, 356, 6);

    /* typography — plain black for the handwriting line, a vibrant accent
       colour for the name (chilli, high-contrast against the green/blue
       garden), and only a thin dark contour instead of the default white
       sticker-outline. Positioned above his now much taller silhouette,
       with real breathing room above his head and between the two lines. */
    const tl = life(t, RAHUL_TITLE_T0, 4.9, .35, .5);
    g.text('meet the groom', {
      x: CX, y: TITLE_Y, size: TITLE_SIZE, font: 'handwriting', color: P.ink,
      scale: tl, alpha: clamp(tl * 1.5), rot: -2, outline: 0,
    });
    const nl = life(t, RAHUL_NAME_T0, 4.6, .4, .5);
    g.text(C.GROOM, {
      x: CX, y: NAME_Y, size: NAME_SIZE, color: P.chilli, ls: 7 * SY,
      scale: nl, scaleY: nl * (1 + (1 - nl) * .1), alpha: clamp(nl * 1.6),
      outline: 4, outlineColor: P.ink,
    });

    /* interests pop into a compact constellation hugging his own body
       (the last, travel, hands off to the airplane bubble below) — the
       PNGs already are the finished glass-bubble badge, so they're drawn
       directly, with no extra circle/border/shadow wrapped around them. */
    const spots = constellationSpots(RAHUL_X);
    const keys = C.CAST.groomInterests;
    keys.forEach((k, i) => {
      const isPlane = i === keys.length - 1;
      const t0 = RAHUL_ICONS_T0 + i * ICON_GAP;
      const outAt = isPlane ? BUBBLE_T0 : BUBBLE_T0 + .4;
      const l = life(t, t0, outAt - t0, .34, .22);
      if (l <= 0) return;
      g.sprite(k, {
        x: spots[i].x, y: spots[i].y, h: HOBBY_ICON_SIZE, anchor: 'center',
        scale: l * (1 + bob(t + i, .5, .018)), rot: bob(t + i * 2, .3, 2),
      });
    });

    /* the standalone airplane sits still while a bubble (a plain circle,
       animated completely independently) appears around it, holds
       briefly, then pops — the airplane itself never scales or otherwise
       changes; only the bubble does. The pop is what releases the flight
       below; nothing flies before it. */
    const bubbleSpot = spots[spots.length - 1];         // same spot as the flight's p0
    const bubbleIn = clamp(p(t, BUBBLE_T0, .18, ease.back));
    const pop = clamp(pl(t, POP_T0, .2));                // the bubble expands, then is gone
    const bubbleShow = bubbleIn * (1 - pop);
    if (bubbleShow > 0) {
      g.ctx.save();
      g.ctx.translate(bubbleSpot.x, bubbleSpot.y);
      const bubbleScale = bubbleShow * (1 + pop * 1.6);
      g.ctx.scale(bubbleScale, bubbleScale);
      g.badge(0, 0, 96 * SY, { alpha: bubbleShow });
      g.ctx.restore();
    }
    if (t < PLANE_ARC_T0 && bubbleIn > 0) {
      g.sprite('travelAirplane', {
        x: bubbleSpot.x, y: bubbleSpot.y, h: 96 * 1.46 / 1.5 * SY, anchor: 'center', alpha: bubbleIn,
      });
    }
    if (pop > 0 && pop < 1) {
      g.rays(bubbleSpot.x, bubbleSpot.y, {
        count: 10, r0: (50 + pop * 40) * SY, r1: (110 + pop * 110) * SY,
        lw: 6 * SY, alpha: 1 - pop, color: P.marigold, rot: pop * 30,
      });
    }

    /* the instant the bubble pops, the airplane takes off: a fast arc
       away from the bubble, then a curved cruise that carries straight
       through the Rahul -> Arya cut without stopping, fading, or
       resetting (see meetArya) — the dashed trail is drawn along the same
       curve (in three pieces: the takeoff arc, the camera-locked cruise
       bezier, then the straight post-release tail) so what's on screen
       actually traces the bend instead of a straight line to wherever the
       plane currently is. */
    if (t >= PLANE_ARC_T0) {
      const head = planeHead(t);
      const arcU = ease.out(clamp((t - PLANE_ARC_T0) / PLANE_ARC_DUR));
      g.trail(PLANE_P0, PLANE_ARC_CP, PLANE_ARC_END, arcU, { color: P.chilli, lw: 8 * SY, dash: [24 * SY, 20 * SY] });
      if (t >= PLANE_CRUISE_T0) {
        const cruiseU = clamp((t - PLANE_CRUISE_T0) / CAM_LOCK_DUR);
        g.trail(PLANE_ARC_END, CRUISE_CP, CRUISE_END, cruiseU, { color: P.chilli, lw: 8 * SY, dash: [24 * SY, 20 * SY] });
        if (t > CAM_RELEASE_T) {
          g.polyline([CRUISE_END, head], { color: P.chilli, lw: 8 * SY, dash: [24 * SY, 20 * SY] });
        }
      }
      g.sprite('travelAirplane', { x: head.x, y: head.y, h: 150 * SY, anchor: 'center', rot: head.angle * .5 });
    }

    g.ctx.restore();
  }

  /* --------------------------------------------------- 2. meet the bride --- */

  function meetArya(g, t) {
    /* This scene opens on the new space the camera panned into during
       Rahul's portion. No garden art is redrawn here at all — the whole
       point (per the storyboard) is that this is the SAME continuous
       garden the camera panned into in Rahul's portion — not a separate
       blank screen — with only a brief, quiet beat before Arya herself
       appears. */
    /* Her own per-snap hold, shorter than Rahul's CUTOUT_HOLD, so the
       entrance lands in .8s instead of 1.2s. Same slideIn, same
       CUTOUT_POSES, same instant snaps — only the holds between them are
       tighter, never a faster slide. */
    const ARYA_ENTER_T0 = .15, ARYA_HOLD = .4;
    const ARYA_SETTLE_T0 = ARYA_ENTER_T0 + 2 * ARYA_HOLD;     // 0.95
    const ARYA_TAG1_T0 = ARYA_SETTLE_T0 + .45;                // 1.40 — the airplane is still well in frame
    const ARYA_TAG2_T0 = ARYA_TAG1_T0 + .55;                  // 1.95
    /* The airplane's last visible pixel is at local 3.82s — measured off
       rendered frames, not estimated: it stops being drawn the moment its
       trailing edge clears the right side of the frame. The title waits a
       clean beat after that, so the plane hands the scene over to the
       typography instead of overlapping it. */
    const ARYA_PLANE_GONE = 1.76;
    const ARYA_TITLE_T0 = ARYA_PLANE_GONE + .27;              // 2.03 — pose swap here too
    const ARYA_NAME_T0 = ARYA_TITLE_T0 + .35;                 // 3.05
    const ARYA_ICONS_T0 = ARYA_TITLE_T0 + 1.3;                // 3.33
    /* Scene 1 ends on a HARD CUT into Scene 2, so nothing here is allowed
       to fade out first. Each element's life() duration is sized so its
       out-phase would only begin at the exact scene boundary — meaning
       inside the scene it is always at full opacity, and the last frame
       of Scene 1 is the complete composition. */
    const ARYA_END = C.SCENE_SECONDS.meetArya;

    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    /* Layer 1 — the same continuous landscape, already risen and settled
       during Rahul's portion, drawn at rest at the stretch of world the
       camera pan settled on (a constant -CAM_FINAL shift — the same
       offset the airplane below uses, so nothing seams or jumps). This is
       a different part of the same garden, not a second backdrop. */
    g.ctx.save();
    g.ctx.translate(-CAM_FINAL, 0);
    gardenSafetyFill(g);
    gardenLandscape(g, bgH / 2, bgW, bgH);

    /* the SAME airplane the bubble launched in Rahul's portion, picked up
       exactly where it left off — global time = this scene's own t plus
       all of Rahul's, so the position/angle continue with no jump, no
       restart, no second sprite. It stays visible while Arya enters and
       settles, only clearing the frame afterward, right before her
       typography appears — the plane physically leads the viewer into
       her introduction rather than vanishing beforehand. */
    const planeGlobalT = t + C.SCENE_SECONDS.meetRahul;
    const head = planeHead(planeGlobalT);
    const planeHalfW = (150 * SY * 1.5) / 2;  // travel_airplane.png is ~1.5:1 at this render height
    if (head.x - CAM_FINAL < C.STAGE.logicalW + planeHalfW) {  // stop drawing only once fully off-canvas
      g.sprite('travelAirplane', { x: head.x, y: head.y, h: 150 * SY, anchor: 'center', rot: head.angle * .5 });
    }
    g.ctx.restore();

    /* Layer 2 — midground vignette, pinned to the viewport exactly as on
       Rahul's side, so this reads as a deliberately framed garden scene
       rather than an extended backdrop. */
    gardenVignette(g, 'gardenMid', bgH / 2);

    /* Arya: a paper cutout snapped into place twice from the right (see
       slideIn / CUTOUT_POSES) — holding fully static in between and
       forever after — starting only after the brief quiet beat above. */
    const slide = slideIn(t, ARYA_ENTER_T0, ARYA_HOLD, 1190 * SX, ARYA_X);
    const pose = t < ARYA_TITLE_T0 ? 'aryaIntro' : 'aryaPose';  // instant stop-motion pose swap, no crossfade

    g.shadow(slide.x, GY + 6 * SY, 92 * SY, 1);
    g.sprite(pose, { x: slide.x, y: GY, h: CHAR_H, flip: true, rot: slide.rot });

    /* Layer 3 — foreground vignette, drawn after the character so its
       flowers sit in front of her. */
    gardenVignette(g, 'gardenFg', bgH / 2);

    const tag = (txt, t0, x, y, rot) => {
      const l = life(t, t0, 1.5, .26, .3);
      if (l <= 0) return;
      g.rays(x, y, { alpha: l * .5, count: 5, r0: TRAIT_SIZE * 1.15, r1: TRAIT_SIZE * 1.6, lw: 7 * SY, rot: 12, color: P.rose });
      g.text(txt, {
        x, y, size: TRAIT_SIZE, color: P.chilli, rot, scale: l,
        outline: 15 * SY, ls: 2 * SY, alpha: clamp(l * 1.4),
      });
    };
    tag(C.BRIDE_TRAITS[0], ARYA_TAG1_T0, 1364, 300, 7);
    tag(C.BRIDE_TRAITS[1], ARYA_TAG2_T0, 300, 356, -6);

    /* typography — plain black for the handwriting line, a vibrant accent
       colour for the name (marigold, high-contrast against the green/blue
       garden), only a thin dark contour instead of the default white
       sticker-outline. Positioned above her now much taller silhouette,
       with the same breathing room as Rahul's. */
    const tl = life(t, ARYA_TITLE_T0, ARYA_END - ARYA_TITLE_T0 + .5, .35, .5);
    g.text('meet the bride', {
      x: CX, y: TITLE_Y, size: TITLE_SIZE, font: 'handwriting', color: P.ink,
      scale: tl, alpha: clamp(tl * 1.5), rot: 2, outline: 0,
    });
    const nl = life(t, ARYA_NAME_T0, ARYA_END - ARYA_NAME_T0 + .5, .4, .5);
    g.text(C.BRIDE, {
      x: CX, y: NAME_Y, size: NAME_SIZE, color: P.marigold, ls: 7 * SY,
      scale: nl, scaleY: nl * (1 + (1 - nl) * .1), alpha: clamp(nl * 1.6),
      outline: 4, outlineColor: P.ink,
    });

    /* same compact constellation treatment as Rahul's, hugging her body —
       PNGs drawn directly, no extra badge wrapper. */
    const spots = constellationSpots(ARYA_X);
    C.CAST.brideInterests.forEach((k, i) => {
      const t0 = ARYA_ICONS_T0 + i * ICON_GAP;
      const l = life(t, t0, ARYA_END - t0 + .26, .34, .26);
      if (l <= 0) return;
      g.sprite(k, {
        x: spots[i].x, y: spots[i].y, h: HOBBY_ICON_SIZE, anchor: 'center',
        scale: l * (1 + bob(t + i, .5, .018)), rot: bob(t + i * 2, .3, 2),
      });
    });
  }

  /* ------------------------------------------------ 3. college and BAM! --- */

  /* Scene 2 beats. Same shape as Scene 1's anchors: each stage is defined
     relative to the one before it, so retiming one thing cascades. The
     environment uses Scene 1's reveal language with short (.5s) holds. */
  /* Deliberately brisk: Scene 1 cuts straight into this, so a long
     environment reveal here reads as a slow transition even though the
     scene boundary itself is an instant hard cut. Whole reveal lands in
     2.45s. */
  /* Same overlapping reveal as the garden — see the note there. Two lap
     values rather than one only because the campus layers are shorter, and
     a single lap could not land both starts where they belong. */
  const COL_L1_T0 = 0, COL_L1_DUR = .65;
  const COL_LAP1 = .05, COL_LAP2 = .10;
  const COL_SETTLE = .25;
  const COL_L2_T0 = COL_L1_T0 + COL_L1_DUR - COL_LAP1, COL_L2_DUR = .55;   // 0.60
  const COL_L3_T0 = COL_L2_T0 + COL_L2_DUR - COL_LAP2, COL_L3_DUR = .50;   // 1.05
  const COL_RAHUL_T0 = COL_L3_T0 + COL_L3_DUR + COL_SETTLE;                // 1.80
  /* slideIn reaches its final pose after 2 holds — see CUTOUT_POSES. */
  const COL_ARYA_T0 = COL_RAHUL_T0 + 2 * CUTOUT_HOLD + .5;                 // 5.9
  const COL_MEET_T0 = COL_ARYA_T0 + 2 * CUTOUT_HOLD + .6;                  // 7.7
  /* bam.png is the ONLY impact artwork in the scene, and it is comic-book
     PUNCTUATION rather than a transition: three discrete frames — a small
     slam-in, a big overshoot, a settled hold — and then it is simply gone.
     It never grows to own the frame. That full-viewport grow is the heart's
     job at the end of Scene 3, and having both do it made the two moments
     read as the same device.

        .07  small, hard tilt      235px
        .07  overshoot the other way   694px
        .18  settle and HOLD      560px
             -> gone, college carries on

     Uniform scale only, so the artwork is never stretched on one axis. */
  const COL_BAM_POSES = [
    { scale: .42, rot: -14, dur: .07 },
    { scale: 1.24, rot: 5, dur: .07 },
    { scale: 1.0, rot: -5, dur: .18 },
  ];
  const COL_BAM_DUR = COL_BAM_POSES.reduce((a, b) => a + b.dur, 0);        // .32
  const COL_BAM_H = 560;                   // the prominent held size, under CHAR_H 580
  /* null once the hold is over — that is what makes it snap away rather
     than linger or fade. */
  const colBamPose = lt => {
    if (lt < 0) return null;
    let acc = 0;
    for (const b of COL_BAM_POSES) {
      acc += b.dur;
      if (lt < acc) return b;
    }
    return null;
  };

  /* Same rendered height as Scene 1 (CHAR_H) so both of them read just as
     clearly here — faces, clothing and the pose change all legible at
     phone/AR distance. The composition is spread around them instead. */
  const COL_CHAR_H = CHAR_H;
  const COL_RAHUL_X = CX - 215, COL_ARYA_X = CX + 215;   // where they settle, before the bump
  const COL_CLOSE = 58;                                   // the final discrete step toward each other

  /* The bump reaction, in the same discrete-pose spirit as CUTOUT_POSES:
     a recoil frame, a smaller settle frame, then static forever. No
     spring, no easing — each entry is simply held for its slice. */
  const COL_JOLT = [
    { back: 26, rot: 5, dur: .14 },
    { back: 9, rot: -2, dur: .13 },
  ];
  const colJolt = lt => {
    if (lt < 0) return { back: 0, rot: 0 };
    let acc = 0;
    for (const j of COL_JOLT) {
      acc += j.dur;
      if (lt < acc) return j;
    }
    return { back: 0, rot: 0 };
  };

  function college(g, t) {
    /* Sky backstop, same as Scene 1: while Layer 1 is still rising it has
       not reached the top of the frame yet, and without this the gap
       above it would be bare canvas. */
    if (g.on('background')) {
      g.ctx.save();
      g.ctx.fillStyle = P.sky;
      g.ctx.fillRect(0, 0, C.STAGE.logicalW, C.STAGE.logicalH);
      g.ctx.restore();
    }

    /* Layer 1 — the campus itself, opaque, edge to edge. Gentle rise,
       then completely static. */
    const l1 = p(t, COL_L1_T0, COL_L1_DUR, ease.out);
    g.sprite('collegeBg', {
      x: CX, y: C.STAGE.logicalH / 2 + (1 - l1) * 620 * SY,
      w: C.STAGE.logicalW, h: C.STAGE.logicalH, anchor: 'center',
    });

    /* Layer 2 — midground vignette (gate pillars, hedges, the COLLEGE
       sign), only once Layer 1 has risen and held. */
    const l2 = p(t, COL_L2_T0, COL_L2_DUR, ease.out);
    g.sprite('collegeMid', {
      x: CX, y: C.STAGE.logicalH / 2 + (1 - l2) * 560 * SY,
      w: C.STAGE.logicalW, h: C.STAGE.logicalH, anchor: 'center',
    });

    /* --- the two cutouts, between Layer 2 and Layer 3 throughout --- */

    /* Both arrive with Scene 1's exact stop-motion helper: discrete snaps
       separated by static holds, never a continuous slide. */
    const rs = slideIn(t, COL_RAHUL_T0, CUTOUT_HOLD, -170 * SX, COL_RAHUL_X);
    const as = slideIn(t, COL_ARYA_T0, CUTOUT_HOLD, 1180 * SX, COL_ARYA_X);

    /* One more discrete step each, straight into each other — a hard snap
       on the frame the bump happens, not an approach. */
    const met = t >= COL_MEET_T0;
    const jolt = colJolt(t - COL_MEET_T0);
    const rx = rs.x + (met ? COL_CLOSE - jolt.back : 0);
    const ax = as.x - (met ? COL_CLOSE - jolt.back : 0);

    /* Instant stop-motion pose swap on impact — no crossfade, no scaling,
       never both poses at once. Permanent from here on. Neither character
       is mirrored: entrance direction and artwork orientation are
       separate things, so both PNGs render exactly as drawn. */
    const rPose = met ? 'rahulCollege' : 'rahulIntro';
    const aPose = met ? 'aryaCollege' : 'aryaIntro';

    g.shadow(rx, GY + 6 * SY, 90 * SY, 1);
    g.shadow(ax, GY + 6 * SY, 92 * SY, 1);
    g.sprite(rPose, { x: rx, y: GY, h: COL_CHAR_H, rot: rs.rot + (met ? jolt.rot : 0) });
    g.sprite(aPose, { x: ax, y: GY, h: COL_CHAR_H, rot: as.rot - (met ? jolt.rot : 0) });

    /* Layer 3 — foreground vignette, drawn after the characters so its
       planting overlaps their feet and gives the scene real depth. */
    const l3 = p(t, COL_L3_T0, COL_L3_DUR, ease.out);
    g.sprite('collegeFg', {
      x: CX, y: C.STAGE.logicalH / 2 + (1 - l3) * 500 * SY,
      w: C.STAGE.logicalW, h: C.STAGE.logicalH, anchor: 'center',
    });

    /* --- the impact graphic, on top of everything --- */

    /* ONE bam.png, drawn by ONE call, struck at the collision point and
       alive for 0.32s only. Only `h` is set, so `w` follows the PNG's own
       ratio and the artwork is never stretched. */
    const bamPose = colBamPose(t - COL_MEET_T0);
    if (bamPose) {
      g.sprite('bam', {
        x: CX, y: GY - COL_CHAR_H * .62, anchor: 'center', rot: bamPose.rot,
        h: COL_BAM_H * bamPose.scale,
      });
    }
  }

  /* ------------------------- 4. friends -> best friends -> lovers (chai) --- */

  /* Scene 3 beats. Four objects tell the whole story, one at a time, over
     a composition that never moves. */
  const TOG_BEATS = [
    { key: 'chai', t0: .6, label: 'friends' },
    { key: 'food', t0: 2.3, label: 'best friends' },
    { key: 'phone', t0: 4.0, label: 'always talking' },
    { key: 'heart', t0: 5.7, label: 'in love' },
  ];
  const TOG_ICON_Y = 230, TOG_ICON_H = 190;   // lifted 100px into the clean sky above the building

  /* The nudge each cutout gets when the object above them changes: a flat
     paper shape knocked sideways and let settle, NOT a bounce. Discrete
     poses in the same spirit as CUTOUT_POSES — a shove frame, a small
     overshoot back, then rest — with almost no vertical travel, and the
     anchor position always restored afterwards. */
  const TOG_NUDGE = [
    { dx: 8, rot: 3.2, dur: .09 },
    { dx: -3.5, rot: -1.6, dur: .08 },
  ];
  const togNudge = (lt, dir, seed) => {
    if (lt < 0) return { dx: 0, rot: 0 };
    const v = .85 + rnd(seed) * .3;            // handmade variation, still deterministic
    let acc = 0;
    for (const n of TOG_NUDGE) {
      acc += n.dur;
      if (lt < acc) return { dx: n.dx * dir * v, rot: n.rot * dir * v };
    }
    return { dx: 0, rot: 0 };                  // settled, and static from here
  };

  /* Exactly two pumps, as discrete held frames — no easing, no loop. */
  const TOG_HEART_POSES = [
    { scale: 1, dur: .20 },      // appears at its normal size
    { scale: 1.3, dur: .12 },    // pump 1
    { scale: 1, dur: .14 },      // return
    { scale: 1.3, dur: .12 },    // pump 2
    { scale: 1, dur: .55 },      // return, then a brief hold
  ];
  const TOG_HEART_T0 = TOG_BEATS[3].t0;
  const TOG_PUMP_END = TOG_HEART_T0 + TOG_HEART_POSES.reduce((a, b) => a + b.dur, 0);  // 6.83
  const togHeartScale = lt => {
    let acc = 0;
    for (const h of TOG_HEART_POSES) {
      acc += h.dur;
      if (lt < acc) return h.scale;
    }
    return 1;
  };
  const TOG_GROW_T0 = TOG_PUMP_END + .55, TOG_GROW_DUR = 1.8;   // 7.38

  function together(g, t) {
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    /* Deliberately static: the same three college layers as Scene 2, but
       drawn at rest every frame — no rise, no pan, no parallax. This is a
       stable composition the whole way through. */
    g.sprite('collegeBg', { x: CX, y: bgH / 2, w: bgW, h: bgH, anchor: 'center' });
    g.sprite('collegeMid', { x: CX, y: bgH / 2, w: bgW, h: bgH, anchor: 'center' });

    /* Which object is up, and when it last changed. */
    let idx = -1;
    TOG_BEATS.forEach((b, i) => { if (t >= b.t0) idx = i; });
    const beat = idx >= 0 ? TOG_BEATS[idx] : null;

    /* Both get knocked in opposite directions, and the direction flips on
       every change, so it reads as handmade rather than mechanical. */
    const dir = idx % 2 === 0 ? 1 : -1;
    const nr = beat ? togNudge(t - beat.t0, dir, idx) : { dx: 0, rot: 0 };
    const na = beat ? togNudge(t - beat.t0, -dir, idx + 7) : { dx: 0, rot: 0 };

    /* Anchors never move; the icon-change nudge is the only offset from
       them, and between nudges they are perfectly still. */
    const rx = COL_RAHUL_X + nr.dx, ax = COL_ARYA_X + na.dx;
    /* Instant stop-motion swap once the heart has finished both pumps. */
    const happy = t >= TOG_PUMP_END;
    g.shadow(rx, GY + 6 * SY, 90 * SY, 1);
    g.shadow(ax, GY + 6 * SY, 92 * SY, 1);
    g.sprite(happy ? 'rahulHappy' : 'rahulIntro', { x: rx, y: GY, h: CHAR_H, rot: nr.rot });
    g.sprite(happy ? 'aryaHappy' : 'aryaIntro', { x: ax, y: GY, h: CHAR_H, rot: na.rot });

    g.sprite('collegeFg', { x: CX, y: bgH / 2, w: bgW, h: bgH, anchor: 'center' });

    if (beat) {
      /* One object at a time, swapped outright — the reaction above is
         what sells the change, not a tween on the icon. */
      if (beat.key === 'heart') {
        const grow = ease.in(pl(t, TOG_GROW_T0, TOG_GROW_DUR));
        /* the same heart artwork throughout: the pumps and the
           full-screen moment are both just its own height, so it is never
           swapped for a different graphic and never distorted */
        g.sprite('heart', {
          x: CX, y: TOG_ICON_Y,
          h: TOG_ICON_H * togHeartScale(t - TOG_HEART_T0) * (1 + grow * 16),
          anchor: 'center',
        });
        if (grow >= 1) g.cover(P.chilli, 1);
      } else {
        g.sprite(beat.key, { x: CX, y: TOG_ICON_Y, h: TOG_ICON_H, anchor: 'center' });
      }

      /* Patrick Hand, the same handwriting face as "meet the groom" /
         "meet the bride" — and like those, with no white sticker outline
         around it. */
      g.text(beat.label, {
        x: CX, y: 112, size: 78 * SY, font: 'handwriting', color: P.leaf,
        rot: idx % 2 ? 2 : -2, outline: 0,
      });
    }

    /* Scene 2 used to end with bam.png grown to fill the frame — a yellow
       starburst — and this cleared that wash away. BAM is impact
       punctuation now and Scene 2 ends on the campus, so there is nothing
       to clear: the cover was painting marigold over a frame that was
       already correct. Removed; Scene 2 cuts straight into Scene 3, which
       opens on the same campus composition anyway. */
  }

  /* ---------------------------------------------- 5. then life happened --- */

  /* Blockbuster title reveal: each word is STAMPED on in discrete frames —
     oversized, a touch under, then settled — never eased or faded in. The
     punch itself stays fast; the gap between words is what gives each one
     room to land. */
  const LIFE_WORDS = ['THEN', 'LIFE', 'HAPPENED'];
  /* .85 -> .68: the punch itself is untouched (LIFE_PUNCH below), only the
     wait between stamps. Each word still holds alone for 0.68s before the
     next lands, which is comfortably readable, and the finished phrase
     still sits complete for 0.55s before it cuts. */
  const LIFE_WORD_GAP = .68;
  const LIFE_PUNCH = [
    { scale: 1.34, rot: -2.5, dur: .05 },
    { scale: .93, rot: 1.5, dur: .05 },
  ];
  const lifePunch = lt => {
    if (lt < 0) return null;                       // not stamped yet
    let acc = 0;
    for (const s of LIFE_PUNCH) {
      acc += s.dur;
      if (lt < acc) return s;
    }
    return { scale: 1, rot: 0 };                   // settled, and static from here
  };

  /* Scene 4 sits on one flat colour rather than an illustrated backdrop, so
     the road, the two of them and the type all read cleanly. Deep navy from
     the film's own palette: it is the one beat of the story that turns, and
     it lets the warm road and the light type carry the frame. */
  const LF_BACKDROP = P.navy;
  const LF_TITLE_T0 = .2;
  const LF_TITLE_SETTLE = LF_TITLE_T0 + 2 * LIFE_WORD_GAP + .1;    // 1.66
  const LF_TITLE_END = LF_TITLE_SETTLE + .55;                      // 2.21 — final hold, then it clears
  /* Title span 2.50s -> 2.21s, 18% faster, all of it taken out of waiting.
     Everything below is only nudged: the three gaps marked (was …) are the
     dead beats where nothing was happening, and nothing else moved. */
  const LF_ROAD_T0 = LF_TITLE_END, LF_ROAD_DUR = .6;               // 2.21 -> 2.81
  const LF_CHARS_T0 = LF_ROAD_T0 + LF_ROAD_DUR + .15;              // 2.96  (was +.25)
  const LF_CHAR_HOLD = .4;                                         // per snap, as in meetArya
  const LF_TOGETHER_T0 = LF_CHARS_T0 + 2 * LF_CHAR_HOLD;           // 3.76
  const LF_SPLIT_T0 = LF_TOGETHER_T0 + .55;                        // 4.31  (was +.7)
  const LF_SPLIT_END = LF_SPLIT_T0 + 2 * LF_CHAR_HOLD;             // 5.11
  const LF_LABEL_T0 = LF_SPLIT_END + .15;                          // 5.26
  const LF_SLIDE_T0 = LF_LABEL_T0 + 1.7;                           // 6.96  (was +2.0)
  const LF_SLIDE_DUR = 1.3;                                        // 8.26 = SCENE_SECONDS.lifeHappened

  /* Measured off road_foreground.png (1670x942, painted rows 360-941): its
     centreline runs down x=865, which is 29px right of frame centre, so the
     art is nudged left by exactly that to put the fork on the middle of the
     screen. The painted road also starts 360px down its own frame, which is
     why 581px is the offset that parks it just below the bottom edge and
     lets it rise up into place. */
  const LF_ROAD_DX = -29, LF_ROAD_RISE = 581;

  /* Standing points taken from the artwork's own rows (already shifted by
     LF_ROAD_DX). Together: the wide near road at y=762, which spans x
     502-1171 there. Apart: the branch centres at y=532, where the left
     branch runs 356-746 and the right 937-1361. They also shrink on the
     move, because that stretch of road is further away. */
  const LF_NEAR_Y = 762, LF_NEAR_H = 540;
  const LF_FAR_Y = 532, LF_FAR_H = 330;
  const LF_TOGETHER_RX = 686, LF_TOGETHER_AX = 986;
  const LF_APART_RX = 551, LF_APART_AX = 1149;

  function lifeHappened(g, t) {
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    /* Flat backdrop, painted full-frame and NOT slid, so the exit below can
       never expose a bare edge. */
    if (g.on('background')) {
      g.ctx.save();
      g.ctx.fillStyle = LF_BACKDROP;
      g.ctx.fillRect(0, 0, bgW, bgH);
      g.ctx.restore();
    }

    /* Everything else rides one transform, so the exit is a single physical
       slide of the whole illustrated composition to the left. */
    const slide = ease.in(pl(t, LF_SLIDE_T0, LF_SLIDE_DUR)) * bgW * .55;
    g.ctx.save();
    g.ctx.translate(-slide, 0);

    /* The road: the supplied artwork, as drawn, rising up from the bottom. */
    if (t >= LF_ROAD_T0) {
      const road = p(t, LF_ROAD_T0, LF_ROAD_DUR, ease.out);
      g.sprite('roadFg', {
        x: CX + LF_ROAD_DX, y: bgH / 2 + (1 - road) * LF_ROAD_RISE,
        w: bgW, h: bgH, anchor: 'center',
      });
    }

    /* The two of them: on together on the central road, hold, then one
       decisive discrete move out along their own branch — further up the
       road and therefore smaller. Same slideIn/CUTOUT_POSES as every other
       scene, and neither is mirrored. */
    if (t >= LF_CHARS_T0) {
      const apart = t >= LF_SPLIT_T0;
      const rs = apart
        ? slideIn(t, LF_SPLIT_T0, LF_CHAR_HOLD, LF_TOGETHER_RX, LF_APART_RX)
        : slideIn(t, LF_CHARS_T0, LF_CHAR_HOLD, -180 * SX, LF_TOGETHER_RX);
      const as = apart
        ? slideIn(t, LF_SPLIT_T0, LF_CHAR_HOLD, LF_TOGETHER_AX, LF_APART_AX)
        : slideIn(t, LF_CHARS_T0, LF_CHAR_HOLD, 1190 * SX, LF_TOGETHER_AX);
      /* the walk up the road is a discrete step too — it lands on the same
         snaps as the sideways move, never a smooth glide */
      const step = apart ? cutoutFrac(t, LF_SPLIT_T0, LF_CHAR_HOLD) : 0;
      const y = lerp(LF_NEAR_Y, LF_FAR_Y, step);
      const h = lerp(LF_NEAR_H, LF_FAR_H, step);

      g.shadow(rs.x, y + 6 * SY, h * .16, 1);
      g.shadow(as.x, y + 6 * SY, h * .16, 1);
      g.sprite('rahulIntro', { x: rs.x, y, h, rot: rs.rot });
      g.sprite('aryaIntro', { x: as.x, y, h, rot: as.rot });
    }

    /* Where each road goes — stamped on with the same punch as the title,
       in light type beside each of them. No card, no badge, no container. */
    const labels = [
      { x: 235, side: C.SPLIT.left },
      { x: 1437, side: C.SPLIT.right },
    ];
    labels.forEach((l, i) => {
      const pose = lifePunch(t - (LF_LABEL_T0 + i * .18));
      if (!pose) return;
      g.text(l.side.big, {
        x: l.x, y: 300, size: 92 * SY, font: 'handwriting', color: P.paper,
        scale: pose.scale, rot: pose.rot, outline: 0,
      });
      g.text(l.side.small, {
        x: l.x, y: 372, size: 70 * SY, font: 'handwriting', color: P.marigold,
        scale: pose.scale, rot: pose.rot, outline: 0,
      });
    });

    /* The title holds, then is simply gone on the next frame — a cut, not
       a fade. Modak, and only here. */
    if (t < LF_TITLE_END) {
      LIFE_WORDS.forEach((w, i) => {
        const pose = lifePunch(t - (LF_TITLE_T0 + i * LIFE_WORD_GAP));
        if (!pose) return;
        g.text(w, {
          x: CX, y: 330 + i * 190, size: 175, font: 'title',
          color: P.ink, scale: pose.scale, rot: pose.rot, outline: 0,
        });
      });
    }

    g.ctx.restore();

    /* the chilli the heart left behind at the end of Scene 3 clears off */
    if (t < .3) g.cover(P.chilli, 1 - pl(t, 0, .3));
  }

  /* -------------------------------------------------- 6. one day, abroad --- */

  /* Scene 5 is a title card that opens onto the flight map, so it sits on a
     flat colour like Scene 4 rather than an illustrated backdrop — cream
     this time, because this is the beat where the story turns back up. */
  const OD_BACKDROP = P.paper;
  const OD_TITLE_T0 = .2, OD_SUB_T0 = .85;
  const OD_TITLE_SETTLE = OD_SUB_T0 + .1;                          // 0.95
  const OD_TITLE_END = 1.7;                                        // title clears, story starts
  const OD_PLANE_T0 = OD_TITLE_END, OD_PLANE_DUR = 1.8;            // 1.70 -> 3.50
  const OD_PLANE_B_LAG = .15;                                      // B lands just after A
  const OD_MERGE_T0 = OD_PLANE_T0 + OD_PLANE_DUR + OD_PLANE_B_LAG; // 3.65
  const OD_MERGE_DUR = 1.2;                                        // -> 4.85
  const OD_FRANCE_T0 = OD_MERGE_T0 + OD_MERGE_DUR + .1;            // 4.95
  /* The exit is a TRANSITION, not a beat of its own: France holds, then the
     plane snaps forward, the line whips after it, and the scene is cut the
     moment it clears the frame. Two fast moves with a breath between them —
     the same FAST MOVE -> HOLD -> FAST MOVE -> STOP the rest of the film
     uses — rather than one long draw sitting on empty cream. 6.10 -> 6.62,
     and SCENE_SECONDS.oneDay ends at 6.65 so nothing hangs after it. */
  const OD_EXIT_T0 = 6.1;
  const OD_EXIT_A = .18, OD_EXIT_HOLD = .12, OD_EXIT_B = .22;      // -> 6.62
  const OD_EXIT_MID = .45;                                         // drawn by the first snap

  /* All of this was authored for the old 1000x1500 portrait frame, where the
     convergence point sat at y=1080 and the planes started at y=1420 — both
     far below a 941-tall stage, which is why the whole flight was invisible.
     These are re-laid out for the landscape frame rather than scaled: the two
     planes sweep in from the bottom corners, meet just below centre, and the
     joined trail runs up-left to France and then onward off the left edge. */
  const OD_MEET = { x: CX, y: 640 };
  const OD_A0 = { x: -160, y: 900 }, OD_AC = { x: 420, y: 900 };
  const OD_B0 = { x: 1832, y: 900 }, OD_BC = { x: 1252, y: 900 };
  const OD_MERGE_CP = { x: 1000, y: 520 }, OD_MERGE_END = { x: 1150, y: 430 };
  const OD_EXIT_CP = { x: 1420, y: 420 }, OD_EXIT_END = { x: 1740, y: 510 };
  const OD_FLAG = { x: 1180, y: 210, h: 300 };
  const OD_LABEL = { x: 700, y: 250 };

  function oneDay(g, t) {
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    if (g.on('background')) {
      g.ctx.save();
      g.ctx.fillStyle = OD_BACKDROP;
      g.ctx.fillRect(0, 0, bgW, bgH);
      g.ctx.restore();
    }

    /* Title card: both lines Modak, stamped on with the same discrete punch
       as Scene 4 — no life() fade envelope — then cut away before the
       flight begins. Size alone carries the hierarchy. */
    if (t < OD_TITLE_END) {
      const big = lifePunch(t - OD_TITLE_T0);
      if (big) {
        g.text('ONE DAY', {
          x: CX, y: 475, size: 230, font: 'title', color: P.chilli,
          scale: big.scale, rot: big.rot, outline: 0,
        });
      }
      const small = lifePunch(t - OD_SUB_T0);
      if (small) {
        g.text('ON VACATION', {
          x: CX, y: 615, size: 110, font: 'title', color: P.ink,
          scale: small.scale, rot: small.rot, outline: 0,
        });
      }
    }

    /* The flight is stepped on the film's own animatic clock (STAGE.choppy)
       rather than tweened — the same quantiser the other scenes use — so it
       reads as stop-motion while still clearly travelling in one direction. */
    const qt = q(t, C.STAGE.choppy);

    /* 1.70 - 3.65  two planes, two trails, curving toward the same point */
    const pa = pl(qt, OD_PLANE_T0, OD_PLANE_DUR);
    const pb = pl(qt, OD_PLANE_T0 + OD_PLANE_B_LAG, OD_PLANE_DUR);
    if (pa > 0) {
      const head = g.trail(OD_A0, OD_AC, OD_MEET, pa, { color: P.chilli, lw: 8, dash: [22, 18] });
      if (pa < 1) g.sprite('airplane', { x: head.x, y: head.y, h: 95, anchor: 'center', rot: head.angle });
    }
    if (pb > 0) {
      const head = g.trail(OD_B0, OD_BC, OD_MEET, pb, { color: P.navy, lw: 8, dash: [22, 18] });
      if (pb < 1) g.sprite('airplane', { x: head.x, y: head.y, h: 95, anchor: 'center', flip: true, rot: head.angle - 180 });
    }

    /* 3.65  the two lines carry on as one, up toward France */
    const merged = pl(qt, OD_MERGE_T0, OD_MERGE_DUR);
    if (merged > 0) {
      const head = g.trail(OD_MEET, OD_MERGE_CP, OD_MERGE_END, merged,
        { color: P.ink, lw: 9, dash: [26, 16] });
      if (merged < 1) {
        g.sprite('airplane', { x: head.x, y: head.y, h: 100, anchor: 'center', rot: head.angle });
      }
      const spark = 1 - pl(t, OD_MERGE_T0, .5);
      if (spark > 0) {
        g.rays(OD_MEET.x, OD_MEET.y, {
          count: 8, r0: 40, r1: 90 + (1 - spark) * 40, lw: 7, alpha: spark, color: P.marigold,
        });
      }
    }

    /* 4.95  France — punched into place, then completely static. */
    const fp = lifePunch(t - OD_FRANCE_T0);
    if (fp) {
      g.sprite('franceFlag', {
        x: OD_FLAG.x, y: OD_FLAG.y, h: OD_FLAG.h, anchor: 'center',
        scale: fp.scale, rot: fp.rot,
      });
    }
    const lp = lifePunch(t - (OD_FRANCE_T0 + .18));
    if (lp) {
      g.text('FRANCE', {
        x: OD_LABEL.x, y: OD_LABEL.y, size: 96, color: P.navy, ls: 3,
        scale: lp.scale, rot: lp.rot,
      });
    }

    /* 6.10  France has held; the plane snaps forward, the line whips after
       it, and the frame is cut the instant it clears the edge. Two discrete
       moves with a hold between them — never one slow continuous draw. */
    const elt = qt - OD_EXIT_T0;
    const out = elt <= 0 ? 0
      : elt < OD_EXIT_A ? OD_EXIT_MID * (elt / OD_EXIT_A)
        : elt < OD_EXIT_A + OD_EXIT_HOLD ? OD_EXIT_MID
          : OD_EXIT_MID + (1 - OD_EXIT_MID) *
            clamp((elt - OD_EXIT_A - OD_EXIT_HOLD) / OD_EXIT_B);
    if (out > 0) {
      const head = g.trail(OD_MERGE_END, OD_EXIT_CP, OD_EXIT_END, out,
        { color: P.ink, lw: 9, dash: [26, 16] });
      /* the plane leads the line out, exactly as it led it in */
      if (out < 1) {
        g.sprite('airplane', { x: head.x, y: head.y, h: 100, anchor: 'center', rot: head.angle });
      }
    }
  }

  /* --------------------------------- 7. airport -> Paris -> the proposal --- */

  /* Scene 5 now ends the instant its plane clears the frame, so the cut
     lands straight on the terminal rising — there is no travel line and no
     flat-colour pre-roll at the top of this scene any more. PA_SKY is only
     what shows behind a set while it is still on its way up. */
  const PA_SKY = '#dcc1aa';

  /* Environment rhythm. The airport is three layers; the replacement river,
     Louvre and Eiffel art has no midground files, so those are two-layer. */
  const PA_ENV_BG = .65, PA_ENV_MID = .55, PA_ENV_FG = .50, PA_ENV_HOLD = .25;
  /* The airport background does not rise at all (bgSet — it is the target
     of Scene 5's hard cut), so deriving the midground's start from
     PA_ENV_BG left a 0.90s wait on a motionless picture for a rise that
     never happened. These are now set directly: the midground follows
     almost immediately and the foreground overlaps it, the same
     coordinated reveal the garden and campus now use. */
  const PA_MID_OFF = .18;                                             // L2 starts
  const PA_FG3_OFF = .58;                                             // L3 starts, .15 before L2 settles
  const PA_ENV_SPAN = PA_FG3_OFF + PA_ENV_FG;                         // 1.08 (airport)

  /* The journey between stops, as one continuous move rather than an
     animation followed by a wait:

        story moment, couple still there
        PA_LINE_DRAW   the travel line draws in — this IS the drag handle
        [GATE]         the clock holds here until the viewer pulls the
                       journey forward (or the fallback fires)
        PA_SLIDE_DUR   the next destination slides in from the RIGHT
        PA_SETTLE      a beat to land
        story moment

     Every stop's t0 below is the frame the gate releases on, so the slide
     begins the instant the gesture completes — there is no gap between the
     drag and the destination arriving. */
  const PA_LINE_DRAW = .45;
  const PA_SLIDE_DUR = .50;
  const PA_SETTLE = .15;

  /* The terminal starts building on the scene's very first frame. Every
     other absolute time below came down by the same 1.1s, so the whole
     scene keeps its approved internal rhythm exactly — nothing got longer
     or shorter, the dead pre-roll simply went away and SCENE_SECONDS.paris
     came down 24.6 -> 23.5 to match. */
  const PA_AIRPORT_T0 = 0;
  /* The destination times are derived from the airport story further down,
     once PA_BIGHAPPY_T0 and the affordance timing exist. */


  /* The airport arrival — unchanged. */
  /* .92 rather than .90 only so PA_RAHUL_T0 lands on a round 2.00 once the
     dead wait above is gone; the arrival rhythm itself is untouched. */
  /* Every beat of the arrival is kept — he arrives, she arrives, he reacts,
     she reacts, they turn happy — only the waiting between them is trimmed.
     The old chain sat on an empty terminal for .92s, then held 1.5s between
     his reaction and hers, and the affordance did not appear until 7.60s.
     (was -> now):  establish .92 -> .60, her entrance +1.0 -> +.70,
     her reaction +1.5 -> +.85, turning happy +.70 -> +.60. */
  const PA_ESTABLISH = .60;
  const PA_CHAR_HOLD = .45;
  const PA_RAHUL_T0 = PA_AIRPORT_T0 + PA_ENV_SPAN + PA_ESTABLISH;     // 1.68
  const PA_RAHUL_SET = PA_RAHUL_T0 + 2 * PA_CHAR_HOLD;                // 2.58
  const PA_ARYA_T0 = PA_RAHUL_SET + .70;                              // 3.28
  const PA_ARYA_SET = PA_ARYA_T0 + 2 * PA_CHAR_HOLD;                  // 4.18
  const PA_RAHUL_SWAP = PA_ARYA_SET;                                  // 4.18
  const PA_ARYA_SWAP = PA_ARYA_SET + .85;                             // 5.03
  /* Happy and together — the end of the airport story. */
  const PA_BIGHAPPY_T0 = PA_ARYA_SWAP + .60;                          // 5.63

  /* The single interaction. A plane noses in from the LEFT edge, stops, and
     waits on a small white paper patch with a handwritten line under it; a
     short RIGHTWARD pull sends it on and the Seine follows in from the
     right. Its own geometry, kept well away from PA_HOPS so the affordance
     never reads as one of the cinematic travel lines that play later.

     The plane points RIGHT — the way it is about to go, and the way the
     gesture goes. Offsets below are signed shifts of the whole assembly in
     stage px: negative while it is still arriving from the left, positive
     once it is being pulled away to the right.
       The on-screen geometry that used to sit here is gone: the affordance
       is now a DOM card on the phone, not artwork inside the film. */
  /* A short intentional beat on the happy pose, then the affordance noses
     in. PA_PEEK_DUR settles it .05 before the gate parks, so it is genuinely
     motionless while it waits rather than frozen mid-approach. */
  const PA_PULL_LEAD = .45, PA_PEEK_DUR = .40;
  const PA_PULL_T0 = PA_BIGHAPPY_T0 + PA_PULL_LEAD;                   // 6.08

  /* The stops, in order. Declared before anything derives from them. */
  const PA_SEINE_T0 = PA_PULL_T0 + PA_PEEK_DUR + .05;                 // 6.53
  const PA_LEG = 3.30;                      // arrive, story moment, line out
  const PA_LOUVRE_T0 = PA_SEINE_T0 + PA_LEG;                          // 9.83
  const PA_EIFFEL_T0 = PA_LOUVRE_T0 + PA_LEG;                         // 13.13

  /* Proposal, once the Eiffel foreground has settled. Every swap here is an
     instant cutout change — the only thing that is slow is the HOLD on her
     surprise, which is the payoff the whole travel sequence is built to
     reach, so it gets a full two seconds before she breaks into joy. */
  const PA_EIFFEL_SET = PA_EIFFEL_T0 + PA_SLIDE_DUR + PA_SETTLE;      // 15.30
  const PA_PROPOSE_T0 = PA_EIFFEL_SET + .35;                          // 15.65
  const PA_ARYA_REACT_T0 = PA_PROPOSE_T0 + .15;                       // 15.80

  /* One gate per leg of the journey, so each drag of the screen card moves
     the film on by exactly ONE destination and no more. Until now there was
     a single gate and Seine -> Louvre -> Eiffel played themselves; the card
     shows four stops, so there are four holds. Scene LENGTH is untouched —
     a gate stops the clock, it never retimes anything. main.js reads this.

     Each sits .03 BEFORE its destination's t0, never on it: `cur` advances
     on t >= t0, so a gate exactly on the boundary would park the clock on
     the first frame that already belongs to the next stop.

     Declared here, after PA_PROPOSE_T0 — these are `const`, so referring to
     a stop above before its declaration is a temporal-dead-zone error that
     takes the whole file down. */
  const PA_GATES = [
    PA_SEINE_T0 - .03,      // 6.50   airport -> seine
    PA_LOUVRE_T0 - .03,     // 9.80   seine   -> louvre
    PA_EIFFEL_T0 - .03,     // 13.10  louvre  -> eiffel
  ];
  /* ONE GATE PER TRAVEL LEG, AND NOTHING AFTER THE LAST ONE.
     There were four holds here; the fourth sat at PA_PROPOSE_T0 and asked
     the viewer to drag the proposal into existence, which is not a journey
     at all — it happens where they already are, at the Eiffel. Arriving
     there IS arriving in Paris, so the travel interaction is finished the
     moment that third drag lands.

     Everything from here runs on the clock alone and always did:
       PA_PROPOSE_T0    15.65  Rahul drops to one knee
       PA_ARYA_REACT_T0 15.80  her surprise
       PA_ARYA_JOY_T0   17.80  she breaks into joy
       PA_WIPE_T0       18.60  the hand-off into the celebrations
     All plain `t >=` checks with no gate among them, so taking the fourth
     hold away restores the proposal to playing by itself. No timing, pose
     or artwork below moves. */
  const PA_ARYA_SURPRISE_HOLD = 2.0;
  const PA_ARYA_JOY_T0 = PA_ARYA_REACT_T0 + PA_ARYA_SURPRISE_HOLD;    // 17.80
  const PA_WIPE_T0 = PA_ARYA_JOY_T0 + .80, PA_WIPE_DUR = 1.6;         // 17.08 -> 18.68                         // -> 23.5

  /* Every coordinate below is read off the replacement artwork, not carried
     over from the old assets:

       river_foreground IS the boat (1983x793) — a cockpit view looking
       forward over the seating. Fitted to the stage width and sat on the
       bottom edge it occupies y 272-941, so a couple drawn underneath it
       disappears into the upholstery.

       `front` is a deliberate exception to the film's usual layer order, and
       it applies to the Seine and the Louvre ONLY: at those two stops the
       environment is built complete — background, foreground and all — and
       then the couple and their cases are laid over the top of it, so
       nothing can swallow them. Everywhere else in the film the foreground
       still goes last.

       louvre_background (1536x1024) puts the paved courtyard at source row
       660; fitted to width and hung from the top of the frame that lands at
       y 718, so they stand at 850, well onto the stone.

       eiffel_background (1536x1024) puts the esplanade at source row 745 ->
       frame y 811, so they stand at 880 with the tower rising between them. */
  const PA_FLOOR = GY + 62;                                           // 802
  const PA_STOPS = [
    /* The terminal floor sits lower than the film's shared GY: standing at
       740 they read as hovering a little above the tiles. PA_FLOOR drops
       both of them and both cases onto the floor plane itself. Airport
       only — GY is shared with every other scene and must not move. */
    { t0: PA_AIRPORT_T0, bg: 'airportBg', mid: 'airportMid', fg: 'airportFg', full: true, bgSet: true,
      rx: CX, ax: 1140, feet: PA_FLOOR, cases: true, caseY: PA_FLOOR, caseDX: 168, caseH: 250 },
    /* fgScale/fgDx/fgDy pull the boat back and over to one side without
       touching the river behind it:
       the background is drawn exactly as before, only the boat shrinks and
       drops, so more of the Seine shows around it. The couple and the cases
       are authored in the boat's original space and carried through the
       same transform, so they stay standing in it. */
    { t0: PA_SEINE_T0, bg: 'riverBg', fg: 'riverFg', front: true,
      fgScale: .68, fgDx: 250, fgDy: 130, charK: 1.36,
      rx: 680, ax: 996, feet: 697, cases: true, caseY: 697, caseDX: 165, caseH: 250 },
    { t0: PA_LOUVRE_T0, bg: 'louvreBg', fg: 'louvreFg', front: true,
      rx: 700, ax: 980, feet: 850, cases: true, caseY: 850, caseDX: 196, caseH: 235 },
    { t0: PA_EIFFEL_T0, bg: 'eiffelBg', fg: 'eiffelFg',
      rx: 700, ax: 980, feet: 880, cases: false },
  ];

  /* One continuous journey: each hop starts near where the last one finished
     and climbs a little, so they read as one route rather than three
     unrelated swooshes. Same dashed ink language as Scene 5. */
  const PA_HOPS = [
    { p0: { x: -80, y: 640 }, cp: { x: 540, y: 300 }, p1: { x: 1760, y: 330 } },
    { p0: { x: -80, y: 330 }, cp: { x: 700, y: 130 }, p1: { x: 1760, y: 280 } },
    { p0: { x: -80, y: 280 }, cp: { x: 640, y: 120 }, p1: { x: 1760, y: 250 } },
  ];

  const paRahulPose = t =>
    t >= PA_PROPOSE_T0 ? 'rahulPropose'
      : t >= PA_BIGHAPPY_T0 ? 'rahulBigHappy'
        : t >= PA_RAHUL_SWAP ? 'rahulAirport' : 'rahulFrance';
  const paAryaPose = t =>
    t >= PA_ARYA_JOY_T0 ? 'aryaBigHappy'
      : t >= PA_ARYA_REACT_T0 ? 'aryaAirport'
        : t >= PA_BIGHAPPY_T0 ? 'aryaBigHappy'
          : t >= PA_ARYA_SWAP ? 'aryaAirport' : 'aryaFrance';

  function paris(g, t) {
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;
    /* cleared every frame; only the airport affordance sets it */
    g.hit = null;

    /* One layer at whatever point of its rise it is in. `full` art matches
       the stage exactly; everything else is fitted to WIDTH and allowed to
       overflow vertically, so nothing is ever stretched to fit the frame. */
    /* `full` art (the airport) matches the stage and still builds in place.
       A destination instead slides in HORIZONTALLY: at prog 0 it sits one
       full frame-width to the right, at prog 1 it is home. Background and
       foreground share one prog, so the world arrives as a single piece and
       the old destination underneath is never uncovered. */
    const layer = (key, prog, rise, mode, k, dy, dx) => {
      const slide = mode === 'full' ? 0 : (1 - prog) * bgW;
      const o = { x: CX + (dx || 0) + slide, w: bgW * (k || 1) };
      if (mode === 'full') { o.h = bgH; o.y = bgH / 2 + (1 - prog) * rise; o.anchor = 'center'; }
      else if (mode === 'bg') { o.y = 0; o.anchor = 'top'; }
      else { o.y = bgH + (dy || 0); o.anchor = 'bottom'; }
      g.sprite(key, o);
    };
    const drawStop = (s, prog) => {
      /* bgSet: this set's background is not slid into place, it is simply
         already there. The airport uses it because Scene 5 hard-cuts into
         this scene — if the terminal rose from below, the cut would land on
         a band of flat colour instead of on the illustration. Its midground
         and foreground still build in on the beats below. */
      layer(s.bg, s.bgSet ? 1 : prog, 620 * SY, s.full ? 'full' : 'bg');
      if (s.mid) layer(s.mid, s.full ? p(t, s.t0 + PA_MID_OFF, PA_ENV_MID, ease.out) : prog, 560 * SY, 'full');
    };
    const drawStopFg = (s, prog) =>
      layer(s.fg, prog, 500 * SY, s.full ? 'full' : 'fg', s.fgScale, s.fgDy, s.fgDx);

    /* A stop may shrink, drop and shift its foreground alone — the Seine
       does, so the boat sits off to one side with open river beside it —
       while its BACKGROUND stays exactly where it is. Everything that
       belongs to that foreground (the couple, their cases) has to travel
       with it or they stop being in it, so the authored coordinates below
       are read in the foreground's own space and mapped through here rather
       than being re-typed by hand. */
    const fgXf = (s) => {
      const k = s.fgScale || 1;
      if (k === 1 && !s.fgDy && !s.fgDx) return { k: 1, x: x => x, y: y => y };
      const im = g.img(s.fg);
      const h0 = im && im.width ? bgW * im.height / im.width : bgH;
      const top0 = bgH - h0, top1 = bgH + (s.fgDy || 0) - h0 * k;
      const dx = s.fgDx || 0;
      return { k, x: x => CX + (x - CX) * k + dx, y: y => top1 + (y - top0) * k };
    };

    if (g.on('background')) {
      g.ctx.save();
      g.ctx.fillStyle = PA_SKY;
      g.ctx.fillRect(0, 0, bgW, bgH);
      g.ctx.restore();
    }

    let cur = -1;
    PA_STOPS.forEach((s, i) => { if (t >= s.t0) cur = i; });
    const stop = cur >= 0 ? PA_STOPS[cur] : null;
    const prev = cur > 0 ? PA_STOPS[cur - 1] : null;
    if (!stop) return;

    /* The airport builds in place at the opening pace; a destination is one
       horizontal slide, background and foreground together. */
    const slideProg = stop.full ? 1 : p(t, stop.t0, PA_SLIDE_DUR, ease.out);
    const bgProg = stop.full ? p(t, stop.t0, PA_ENV_BG, ease.out) : slideProg;
    const fgProg = stop.full ? p(t, stop.t0 + PA_FG3_OFF, PA_ENV_FG, ease.out) : slideProg;

    const next = PA_STOPS[cur + 1];
    const hopInk = { color: P.ink, lw: 9, dash: [26, 16] };

    /* The place they are leaving stays complete underneath until the new one
       has finished sliding over it, so the frame is full the whole way and
       no canvas edge is ever exposed. */
    if (prev && slideProg < 1) {
      drawStop(prev, 1); drawStopFg(prev, 1);
      /* the line they travelled, still lying across the old world */
      const h = PA_HOPS[cur - 1];
      g.trail(h.p0, h.cp, h.p1, 1, hopInk);
    }

    drawStop(stop, bgProg);


    /* --- the couple --- */

    /* They hold their stop right up to the moment the journey moves — the
       gate frame — and are gone while the world slides. */
    const gone = next && t >= next.t0;
    /* A destination has to have arrived and settled before they are in it. */
    const here = stop.full ? t >= PA_RAHUL_T0
      : t >= stop.t0 + PA_SLIDE_DUR + PA_SETTLE;

    /* THE EXCEPTION: at the Seine and the Louvre the foreground goes down
       first and the couple go over the top of it, so the boat and the
       courtyard furniture can never hide them. Everywhere else the
       foreground still goes last, below. */
    if (stop.front) drawStopFg(stop, fgProg);

    if (here && !gone) {
      if (stop.full) {
        /* the airport keeps its original arrival choreography */
        const rs = slideIn(t, PA_RAHUL_T0, PA_CHAR_HOLD, -180 * SX, stop.rx);
        if (stop.cases) {
          const cx2 = lerp(-180 * SX, stop.rx, cutoutFrac(t, PA_RAHUL_T0, PA_CHAR_HOLD)) - stop.caseDX;
          g.sprite('rahulSuitcase', { x: cx2, y: stop.caseY, h: stop.caseH });
        }
        g.shadow(rs.x, stop.feet + 6 * SY, 90 * SY, 1);
        g.sprite(paRahulPose(t), { x: rs.x, y: stop.feet, h: CHAR_H, rot: rs.rot });
        if (t >= PA_ARYA_T0) {
          const as = slideIn(t, PA_ARYA_T0, PA_CHAR_HOLD, 1190 * SX, stop.ax);
          if (stop.cases) {
            const cx3 = lerp(1190 * SX, stop.ax, cutoutFrac(t, PA_ARYA_T0, PA_CHAR_HOLD)) + stop.caseDX;
            g.sprite('aryaSuitcase', { x: cx3, y: stop.caseY, h: stop.caseH });
          }
          g.shadow(as.x, stop.feet + 6 * SY, 92 * SY, 1);
          g.sprite(paAryaPose(t), { x: as.x, y: stop.feet, h: CHAR_H, rot: as.rot });
        }
      } else {
        /* every later stop: they are simply there, and completely still,
           riding whatever scale and drop that stop's foreground has */
        const f = fgXf(stop);
        /* charK is how big a passenger is against the set they are in — the
           Seine needs it because you are looking down the length of a boat,
           so people standing in it are much smaller than the hull framing
           the shot. Everywhere else it is 1 and nothing changes. */
        const ck = f.k * (stop.charK || 1);
        if (stop.cases) {
          g.sprite('rahulSuitcase', { x: f.x(stop.rx - stop.caseDX), y: f.y(stop.caseY), h: stop.caseH * ck });
          g.sprite('aryaSuitcase', { x: f.x(stop.ax + stop.caseDX), y: f.y(stop.caseY), h: stop.caseH * ck });
        }
        g.sprite(paRahulPose(t), { x: f.x(stop.rx), y: f.y(stop.feet), h: CHAR_H * ck });
        g.sprite(paAryaPose(t), { x: f.x(stop.ax), y: f.y(stop.feet), h: CHAR_H * ck });
      }
    }

    if (!stop.front) drawStopFg(stop, fgProg);

    /* The line OUT of here, drawn last so nothing can cover it. It lays
       itself across the place they are still standing in — they stay in
       frame while it does, so the journey reads as leaving somewhere rather
       than cutting away from it — and then the clock holds on the finished
       line while the viewer pulls it forward.

       g.drag is 0..1, handed in by the director while a gate is open: the
       plane at the head of the line eases forward under the finger, so the
       gesture feels like it is moving the journey. It is not a second
       animation; it is the same line and the same plane, nudged. */
    /* Every leg is purely cinematic now: the line draws and the plane flies
       it. The interaction that used to live here — the white paper patch,
       the peeking plane and the handwritten "drag to travel" prompt, all
       painted into the film itself — has moved off the artwork entirely and
       onto the phone screen as a DOM card (#travel in index.html, driven by
       initTravelUI in main.js). The clock still holds at every gate exactly
       as it did; only the thing the viewer puts a finger on has changed, so
       nothing here needs to publish a hit box any more. */
    if (next) {
      const hp = pl(q(t, C.STAGE.choppy), next.t0 - PA_LINE_DRAW, PA_LINE_DRAW);
      if (hp > 0) {
        const h = PA_HOPS[cur];
        const head = g.trail(h.p0, h.cp, h.p1, hp, hopInk);
        g.sprite('airplane', {
          x: head.x, y: head.y, h: 92, anchor: 'center', rot: head.angle,
        });
      }
    }

    /* the existing hand-off into Scene 7 */
    const sp = pl(t, PA_WIPE_T0, .5);
    const grow = ease.in(pl(t, PA_WIPE_T0, PA_WIPE_DUR));
    if (sp > 0) {
      g.sprite('sparkle', { x: CX, y: 560, h: 150 * ease.back(sp) * (1 + grow * 22), anchor: 'center' });
      if (grow > .45) g.cover(P.marigold, (grow - .45) / .55);
    }
  }

  /* ----------------------------------- 8. sangeet, wedding, reception ----- */

  /* --- the sangeet card -------------------------------------------------
     A flat festive field rather than a room: the night itself is the set,
     so the couple, the decorations and the type carry everything. Deep
     indigo is the one colour in the palette that lets marigold type, cream
     lehenga, gold disco ball and four confetti colours all sit at full
     strength at once — chilli or leaf would swallow one of them.

     sangeet_1 is 1024x1536 with art 0.621 wide per unit tall; sangeet_2 is
     1100x1047 at 1.051 — a dip, so it is shorter and much wider. Drawn at
     one height the couple would visibly jump scale between poses, so pose 2
     is drawn at SG_POSE2_K of pose 1's height, which matches the figures
     rather than the frames. Both are centred in their art and stand on its
     bottom edge, so one shared ground line works for both. */
  const SG_BG = P.navy;
  const SG_POSE_HOLD = 1.0;                   // ~1s per pose, instant swaps
  const SG_POSE2_K = .88;

  const SG_DECOR_T0 = .15;
  const SG_TITLE_T0 = .34;
  const SG_DETAIL_T0 = .68, SG_DETAIL_GAP = .13;
  const SG_COUPLE_T0 = 1.02;

  const SG_TITLE = { y: 232, size: 218 };
  const SG_VAL_Y = 556, SG_LAB_Y = 616;
  const SG_LEFT_X = 398, SG_RIGHT_X = 1300;
  const SG_COUPLE = { base: 925, h: 604 };
  const SG_LIGHTS = { x: 236, y: 0, h: 336 };
  const SG_BALL = { x: 1436, y: -8, h: 356 };

  /* Twinkles sit on the ball's own gold, offset from its centre. Each one
     runs its own short flash on its own phase, so they never pulse together
     and never rotate — a flash is three discrete steps and then nothing. */
  const SG_SPARK_CYCLE = 1.15, SG_SPARK_STEP = .1;
  const SG_SPARK_SCALE = [.5, 1, .66];
  /* Offsets are measured against the ball's drawn sphere, which sits at
     x 1355-1522, y 154-340 once the art is fitted — so every twinkle lands
     on its gold or just off its rim, never adrift beside the title. */
  const SG_SPARKS = [
    { dx: -80, dy: 190, s: 15 }, { dx: 78, dy: 170, s: 19 },
    { dx: -52, dy: 298, s: 13 }, { dx: 66, dy: 292, s: 15 },
    { dx: 6, dy: 126, s: 17 }, { dx: -14, dy: 350, s: 12 },
  ];

  /* Confetti lives in the margins only — two side columns and a band across
     the top — so the title and the two detail blocks always stay clean. It
     does not fall: on each beat one of three groups jumps down a fixed step
     and then holds, which is the same stop-motion rule the characters use. */
  const SG_CONF_BEAT = .42, SG_CONF_DROP = 74;
  /* Each zone wraps within itself, so a top-band piece shuffles along the
     band instead of drifting down across SANGEET. */
  const SG_CONF_ZONES = [
    { x0: 46, xw: 244, top: 150, span: 700 },
    { x0: 1486, xw: 146, top: 150, span: 700 },
    { x0: 60, xw: 1550, top: 22, span: 104 },
  ];
  const SG_CONF_N = 24;
  const SG_CONF_COLS = [P.marigold, P.rose, P.paper, P.leaf, P.chilli];

  /* One confetti implementation, shared by every event card — only the
     palette changes, so the two cards read as one visual system. */
  function cardConfetti(g, tb, cols) {
    const beat = Math.floor(tb / SG_CONF_BEAT);
    for (let n = 0; n < SG_CONF_N; n++) {
      const z = SG_CONF_ZONES[n % 8 < 3 ? 0 : n % 8 < 6 ? 1 : 2];
      const x = z.x0 + rnd(n) * z.xw;
      const y0 = rnd(n + 5) * z.span;

      /* how many beats this piece has taken, one group of three per beat */
      const moves = Math.floor((beat - (n % 3) + 3) / 3);
      const y = z.top + ((y0 + moves * SG_CONF_DROP) % z.span);
      const rot = rnd(n + 17) * 360 + moves * 41;

      g.ctx.save();
      g.ctx.translate(x, y);
      g.ctx.rotate(rot * Math.PI / 180);
      g.ctx.fillStyle = cols[n % cols.length];
      g.ctx.fillRect(-7, -13, 14, 26);
      g.ctx.restore();
    }
  }

  function sangeetCard(g, tb, ev) {
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    g.ctx.save();
    g.ctx.fillStyle = SG_BG;
    g.ctx.fillRect(0, 0, bgW, bgH);
    g.ctx.restore();

    /* --- confetti, behind everything else --- */
    cardConfetti(g, tb, SG_CONF_COLS);

    /* --- hanging decorations, dropped in on the first beat --- */
    const dec = lifePunch(tb - SG_DECOR_T0);
    if (dec) {
      g.sprite('lights', { x: SG_LIGHTS.x, y: SG_LIGHTS.y, h: SG_LIGHTS.h, anchor: 'top', scale: dec.scale });
      g.sprite('discoball', { x: SG_BALL.x, y: SG_BALL.y, h: SG_BALL.h, anchor: 'top', scale: dec.scale });

      /* the twinkles — only once the ball has actually landed */
      if (tb > SG_DECOR_T0 + .2) {
        SG_SPARKS.forEach((sp, k) => {
          const lt = (tb + k * (SG_SPARK_CYCLE / SG_SPARKS.length)) % SG_SPARK_CYCLE;
          const step = Math.floor(lt / SG_SPARK_STEP);
          if (step >= SG_SPARK_SCALE.length) return;      // dark, holding
          g.star(SG_BALL.x + sp.dx, SG_BALL.y + sp.dy, sp.s * SG_SPARK_SCALE[step],
            { fill: P.paper, rot: 8 });
        });
      }
    }

    /* --- the couple: two poses, instant swaps, static through each hold --- */
    const cp = lifePunch(tb - SG_COUPLE_T0);
    if (cp) {
      const two = Math.floor((tb - SG_COUPLE_T0) / SG_POSE_HOLD) % 2 === 1;
      g.sprite(two ? 'sangeet2' : 'sangeet1', {
        x: CX, y: SG_COUPLE.base, h: SG_COUPLE.h * (two ? SG_POSE2_K : 1),
        scale: cp.scale,
      });
    }

    /* --- SANGEET, the strongest thing on the card --- */
    const tp = lifePunch(tb - SG_TITLE_T0);
    if (tp) {
      g.text(ev.name, {
        x: CX, y: SG_TITLE.y, size: SG_TITLE.size, font: 'title',
        color: P.marigold, outline: 0, scale: tp.scale, rot: tp.rot,
      });
    }

    /* --- venue and time, side by side rather than stacked --- */
    const block = (x, value, label, vSize, k) => {
      const bp = lifePunch(tb - (SG_DETAIL_T0 + k * SG_DETAIL_GAP));
      if (!bp) return;
      g.text(value, {
        x, y: SG_VAL_Y, size: vSize, font: 'handwriting', color: P.paper,
        outline: 0, scale: bp.scale, rot: bp.rot,
      });
      g.text(label, {
        x, y: SG_LAB_Y, size: 36, font: 'handwriting', color: P.marigold,
        ls: 6, outline: 0, scale: bp.scale,
      });
    };
    block(SG_LEFT_X, ev.venue, 'VENUE', 82, 0);
    block(SG_RIGHT_X, ev.time, 'TIME', 58, 1);
  }


  /* --- the wedding card ------------------------------------------------
     The sangeet card's sibling: same title size and baseline, same punch
     timings, same 1s pose loop, same confetti, same hang-from-the-top
     decoration grammar. Only the field colour, the art and the framing
     change — marigold instead of indigo, garlands left and umbrellas
     right instead of lights and a disco ball.

     wedding_1 and wedding_2 are both 1536x1024 and both figures fill the
     art's full height, so unlike the sangeet dip this pair needs no height
     correction — one height gives both poses the same figure scale. What
     they do need is a horizontal nudge: pose 1's art sits 39px right of its
     frame's centre and pose 2's 16px, so drawn at a shared x the couple
     would jog sideways on every swap. WD_DX cancels that. */
  const WD_BG = P.marigold;
  const WD_CONF_COLS = [P.chilli, P.rose, P.paper, P.leaf, P.navy];

  const WD_TITLE = { y: SG_TITLE.y, size: SG_TITLE.size };
  const WD_VAL_Y = 336, WD_LAB_Y = 396;
  const WD_LEFT_X = 545, WD_RIGHT_X = 1145;
  const WD_COUPLE = { base: 925, h: 500, dx1: -39, dx2: -16 };
  const WD_GARLANDS = { x: 120, y: 0, h: 560 };
  const WD_UMBRELLA = { x: 1570, y: 0, h: 520 };

  function weddingCard(g, tb, ev) {
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    g.ctx.save();
    g.ctx.fillStyle = WD_BG;
    g.ctx.fillRect(0, 0, bgW, bgH);
    g.ctx.restore();

    cardConfetti(g, tb, WD_CONF_COLS);

    /* --- hanging decorations, dropped in on the first beat, then static.
       Both run off their own edge, which is what makes them read as
       framing rather than as objects placed in the scene. */
    const dec = lifePunch(tb - SG_DECOR_T0);
    if (dec) {
      g.sprite('garlands', { x: WD_GARLANDS.x, y: WD_GARLANDS.y, h: WD_GARLANDS.h, anchor: 'top', scale: dec.scale });
      g.sprite('umbrella', { x: WD_UMBRELLA.x, y: WD_UMBRELLA.y, h: WD_UMBRELLA.h, anchor: 'top', scale: dec.scale });
    }

    /* --- the couple: two poses, instant swaps, static through each hold --- */
    const cp = lifePunch(tb - SG_COUPLE_T0);
    if (cp) {
      const two = Math.floor((tb - SG_COUPLE_T0) / SG_POSE_HOLD) % 2 === 1;
      g.sprite(two ? 'wedding2' : 'wedding1', {
        x: CX + (two ? WD_COUPLE.dx2 : WD_COUPLE.dx1),
        y: WD_COUPLE.base, h: WD_COUPLE.h, scale: cp.scale,
      });
    }

    /* --- WEDDING, the strongest thing on the card --- */
    const tp = lifePunch(tb - SG_TITLE_T0);
    if (tp) {
      g.text(ev.name, {
        x: CX, y: WD_TITLE.y, size: WD_TITLE.size, font: 'title',
        color: P.chilli, outline: 0, scale: tp.scale, rot: tp.rot,
      });
    }

    /* --- venue and time, side by side rather than stacked --- */
    const block = (x, value, label, k) => {
      const bp = lifePunch(tb - (SG_DETAIL_T0 + k * SG_DETAIL_GAP));
      if (!bp) return;
      g.text(value, {
        x, y: WD_VAL_Y, size: 58, font: 'handwriting', color: P.ink,
        outline: 0, scale: bp.scale, rot: bp.rot,
      });
      g.text(label, {
        x, y: WD_LAB_Y, size: 36, font: 'handwriting', color: P.chilli,
        ls: 6, outline: 0, scale: bp.scale,
      });
    };
    block(WD_LEFT_X, ev.venue, 'VENUE', 0);
    block(WD_RIGHT_X, ev.time, 'TIME', 1);
  }


  /* --- the reception card ----------------------------------------------
     The third panel of the triptych, built from the same parts as the other
     two: same punch timings, same 1s pose loop, same confetti helper, same
     hang-from-the-top decoration grammar, same two side-by-side detail
     blocks above the couple that the wedding card uses.

     Plum is the one colour here that is not from PALETTE — the palette has
     no purple, and blue and gold are already spoken for by sangeet and
     wedding. Gold type and gold decor sit on it the way they do on indigo.

     RECEPTION is nine letters against seven, so at a shared point size it
     would run 1112px wide and crowd both decorations. REC_TITLE.size 180
     renders it 918px — the same physical width as SANGEET (919) and
     WEDDING (929), which is the consistency that actually reads on screen.

     reception_1 and reception_2 are both 1231x1277 with their art centred
     within 6px of each other, so unlike the wedding pair they need no
     horizontal correction and no height correction. */
  const REC_BG = '#4e1f4a';
  const REC_CONF_COLS = ['#e8e8ea', '#c7ccd4', '#f4f4f6', '#a9b0bb', '#dfe3e8'];

  const REC_TITLE = { y: SG_TITLE.y, size: 180 };
  const REC_VAL_Y = WD_VAL_Y, REC_LAB_Y = WD_LAB_Y;
  const REC_LEFT_X = 585, REC_RIGHT_X = 1130;
  const REC_COUPLE = { base: WD_COUPLE.base, h: WD_COUPLE.h };
  const REC_STRINGS = { x: 120, y: 0, h: 580 };
  const REC_CHANDELIER = { x: 1500, y: 0, h: 680 };

  function receptionCard(g, tb, ev) {
    const bgW = C.STAGE.logicalW, bgH = C.STAGE.logicalH;

    g.ctx.save();
    g.ctx.fillStyle = REC_BG;
    g.ctx.fillRect(0, 0, bgW, bgH);
    g.ctx.restore();

    cardConfetti(g, tb, REC_CONF_COLS);

    /* --- hanging decorations, dropped in on the first beat, then static --- */
    const dec = lifePunch(tb - SG_DECOR_T0);
    if (dec) {
      g.sprite('strings', { x: REC_STRINGS.x, y: REC_STRINGS.y, h: REC_STRINGS.h, anchor: 'top', scale: dec.scale });
      g.sprite('chandelier', { x: REC_CHANDELIER.x, y: REC_CHANDELIER.y, h: REC_CHANDELIER.h, anchor: 'top', scale: dec.scale });
    }

    /* --- the couple: two poses, instant swaps, static through each hold --- */
    const cp = lifePunch(tb - SG_COUPLE_T0);
    if (cp) {
      const two = Math.floor((tb - SG_COUPLE_T0) / SG_POSE_HOLD) % 2 === 1;
      g.sprite(two ? 'reception2' : 'reception1', {
        x: CX, y: REC_COUPLE.base, h: REC_COUPLE.h, scale: cp.scale,
      });
    }

    /* --- RECEPTION, the strongest thing on the card --- */
    const tp = lifePunch(tb - SG_TITLE_T0);
    if (tp) {
      g.text(ev.name, {
        x: CX, y: REC_TITLE.y, size: REC_TITLE.size, font: 'title',
        color: P.marigold, outline: 0, scale: tp.scale, rot: tp.rot,
      });
    }

    /* --- venue and time, side by side rather than stacked --- */
    const block = (x, value, label, k) => {
      const bp = lifePunch(tb - (SG_DETAIL_T0 + k * SG_DETAIL_GAP));
      if (!bp) return;
      g.text(value, {
        x, y: REC_VAL_Y, size: 58, font: 'handwriting', color: P.paper,
        outline: 0, scale: bp.scale, rot: bp.rot,
      });
      g.text(label, {
        x, y: REC_LAB_Y, size: 36, font: 'handwriting', color: P.marigold,
        ls: 6, outline: 0, scale: bp.scale,
      });
    };
    block(REC_LEFT_X, ev.venue, 'VENUE', 0);
    block(REC_RIGHT_X, ev.time, 'TIME', 1);
  }

  function celebrations(g, t) {
    /* SINGLE-PANEL SCENE. The three event cards are flat graphic
       compositions, not depth compositions: the colour field, the confetti,
       the hanging decor, the couple and the type are all one picture, and
       every other scene's sense of "background" simply does not apply.

       Run once per diorama panel like everything else, each card painted its
       opaque full-frame field onto all four canvases — including the
       foreground panel, which stands nearest the viewer. That sheet of flat
       colour then covered the couple and the type standing behind it, which
       is why the last two celebrations came up blank in AR with only the
       field and a little confetti showing. Painting the whole card on one
       panel restores exactly the composition the preview has always drawn;
       nothing about the design, timing or artwork changes. */
    if (!g.on('characters')) return;

    const each = C.SCENE_SECONDS.celebrations / C.EVENTS.length;

    const i = Math.min(C.EVENTS.length - 1, Math.floor(t / each));
    const tb = t - i * each;
    const ev = C.EVENTS[i];
    const cast = C.CAST.celebrations[i];
    const last = i === C.EVENTS.length - 1;

    /* the sparkle from the proposal collapses away. The sangeet card paints
       its own field, so it goes down first and the collapse plays over it. */
    const shrink = 1 - ease.out(pl(t, 0, .7));
    const collapse = () => {
      if (shrink <= 0) return;
      g.cover(P.marigold, shrink * .9);
      g.sprite('sparkle', { x: CX, y: 700, h: 3000 * shrink, anchor: 'center' });
    };

    if (i === 0) { sangeetCard(g, tb, ev); collapse(); return; }
    if (i === 1) {
      weddingCard(g, tb, ev);
      /* the same cream flash that marks every change of event */
      if (tb < .22) g.cover(P.paper, (1 - tb / .22) * .55);
      return;
    }
    if (i === 2) {
      receptionCard(g, tb, ev);
      /* the same cream flash that marks every change of event */
      if (tb < .22) g.cover(P.paper, (1 - tb / .22) * .55);
      return;
    }
    collapse();

    /* a cream flash on each change of event */
    if (i > 0 && tb < .22) g.cover(P.paper, (1 - tb / .22) * .55);

    const outAt = last ? each - .8 : each - .7;
    const env = life(tb, .25, outAt, .42, .5);
    if (env <= 0) return;

    /* name + the three lines of information, always in the same place */
    g.text(ev.name, {
      x: CX, y: 330, size: 146, color: P.ink, ls: 8,
      scale: life(tb, .25, outAt, .4, .45),
      alpha: clamp(life(tb, .25, outAt, .4, .45) * 1.6),
    });

    const orn = life(tb, .5, outAt - .25, .3, .4);
    if (orn > 0 && g.on('characters')) {
      g.ctx.save();
      g.ctx.globalAlpha = orn;
      g.ctx.strokeStyle = P.marigold;
      g.ctx.lineWidth = 7;
      [-1, 1].forEach(d => {
        g.ctx.beginPath();
        g.ctx.moveTo(CX + d * 46, 382);
        g.ctx.lineTo(CX + d * (46 + 120 * orn), 382);
        g.ctx.stroke();
      });
      g.ctx.restore();
      g.star(CX, 380, 22 * orn, { fill: P.marigold });
    }

    const lines = [
      { txt: ev.venue, size: 58, font: 'body', color: P.ink },
      { txt: ev.date, size: 54, font: 'body', color: P.chilli },
      { txt: ev.time, size: 62, font: 'script', color: P.leaf },
    ];
    lines.forEach((l, k) => {
      const s = life(tb, .62 + k * .16, outAt - .5 - k * .1, .3, .4);
      if (s <= 0) return;
      g.text(l.txt, {
        x: CX, y: 490 + k * 78, size: l.size, font: l.font, color: l.color,
        scale: .94 + s * .06, alpha: clamp(s * 1.5),
      });
    });

    /* the couple slides up from the bottom and keeps a light bounce going */
    const up = ease.back(pl(tb, .95, .7));
    const outp = ease.in(pl(tb, outAt - .1, .5));
    const wob = q(tb, C.STAGE.choppy);
    const y = lerp(1680, GY + 150, up) + bob(wob, .62, 12) + outp * 440;
    const al = clamp(up * 1.2 - outp * 1.6);

    if (cast.mode === 'pair') {
      g.shadow(CX, GY + 142, 190, al * .7);
      g.sprite(cast.a, {
        x: CX, y, h: 690, alpha: al,
        rot: bob(wob, .31, 2.2), scale: 1 + bob(wob, .62, .012),
      });
    } else {
      /* two pose swaps, nothing more */
      const swap = tb > 3.2 && tb < 5.0;
      g.shadow(338, GY + 142, 100, al * .7);
      g.shadow(682, GY + 142, 104, al * .7);
      g.sprite(swap ? cast.groomAlt : cast.groom, {
        x: 336, y: y + bob(wob, .62, 6), h: 620, alpha: al, rot: bob(wob, .3, 2),
      });
      g.sprite(swap ? cast.brideAlt : cast.bride, {
        x: 686, y: y + bob(wob, .62, 6, .5), h: 630, alpha: al, rot: -bob(wob, .3, 2, .3),
      });
    }

    /* sangeet: two glasses, one clink */
    if (cast.glasses && g.on('characters')) {
      const gl = life(tb, 1.6, outAt - 1.8, .35, .4);
      if (gl > 0) {
        const tilt = bob(wob, .7, 7);
        const glass = (x, rot) => {
          g.ctx.save();
          g.ctx.globalAlpha = gl;
          g.ctx.translate(x, 760);
          g.ctx.rotate(rot * Math.PI / 180);
          g.ctx.scale(gl * 1.3, gl * 1.3);
          g.ctx.strokeStyle = P.ink; g.ctx.lineWidth = 6;
          g.ctx.fillStyle = '#b8362c';
          g.ctx.beginPath();
          g.ctx.moveTo(-30, -46); g.ctx.lineTo(30, -46);
          g.ctx.quadraticCurveTo(26, 12, 0, 26);
          g.ctx.quadraticCurveTo(-26, 12, -30, -46);
          g.ctx.closePath(); g.ctx.fill(); g.ctx.stroke();
          g.ctx.beginPath();
          g.ctx.moveTo(0, 26); g.ctx.lineTo(0, 66);
          g.ctx.moveTo(-24, 70); g.ctx.lineTo(24, 70);
          g.ctx.stroke();
          g.ctx.restore();
        };
        glass(838 - 26, -16 - tilt);
        glass(838 + 30, 16 + tilt);
        const clink = 1 - pl(tb, 2.2, .5);
        if (clink > 0) g.star(838, 700, 26 * clink, { fill: P.marigold });
      }
    }

    /* reception: a little confetti */
    if (cast.confetti && g.on('characters')) {
      const cf = life(tb, 1.3, outAt - 1.4, .4, .5);
      const cols = [P.marigold, P.chilli, P.rose, P.leaf];
      for (let n = 0; n < 16; n++) {
        const x = 90 + rnd(n) * 820;
        const fall = ((tb * (60 + rnd(n + 9) * 70) + rnd(n + 3) * 900) % 1500);
        g.ctx.save();
        g.ctx.globalAlpha = cf * .9;
        g.ctx.translate(x, 180 + fall * .72);
        g.ctx.rotate((tb * 2 + n) * (n % 2 ? 1 : -1));
        g.ctx.fillStyle = cols[n % 4];
        g.ctx.fillRect(-7, -14, 14, 28);
        g.ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------------ playlist --- */

  const S = C.SCENE_SECONDS;
  return [
    { id: 'meetRahul', dur: S.meetRahul, draw: meetRahul },
    { id: 'meetArya', dur: S.meetArya, draw: meetArya },
    { id: 'college', dur: S.college, draw: college },
    { id: 'together', dur: S.together, draw: together },
    { id: 'lifeHappened', dur: S.lifeHappened, draw: lifeHappened },
    { id: 'oneDay', dur: S.oneDay, draw: oneDay },
    /* gates: local times where the clock holds for the drag gesture — see
       the director in main.js. Only this scene has them. */
    { id: 'paris', dur: S.paris, draw: paris, gates: PA_GATES },
    { id: 'celebrations', dur: S.celebrations, draw: celebrations },
  ];
})();

window.SCENES = SCENES;
