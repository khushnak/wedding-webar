/* ==========================================================================
   CONFIG — the only file you need to touch for content changes.

   Wedding details ........ EVENTS
   Scene lengths .......... SCENE_SECONDS   (seconds, in story order)
   Fonts .................. FONTS
   Colours ................ PALETTE
   Artwork ................ ASSETS          (filenames under assets/)
   Which pose goes where .. CAST
   AR marker .............. MARKER
   ========================================================================== */

const CONFIG = {

  /* ---------------------------------------------------------------- names */
  GROOM: 'RAHUL',
  BRIDE: 'ARYA',

  /* Traits shown as the characters bounce in. Two each, keep them short. */
  GROOM_TRAITS: ['CHILL', 'CHARISMATIC'],
  BRIDE_TRAITS: ['CHEERFUL', 'BUBBLY'],

  /* ------------------------------------------------------- event details */
  /* Replace venue / date / time. Leave the order as is — the three lines are
     rendered large, medium, medium in that sequence.                        */
  EVENTS: [
    {
      name: 'SANGEET',
      venue: 'DELHI',
      date: '14 February 2027',
      time: '7 AM ONWARDS',
    },
    {
      name: 'WEDDING',
      venue: 'Shivraj Lawns, Nashik',
      date: '15 February 2027',
      time: '11:30 am — muhurat',
    },
    {
      name: 'RECEPTION',
      venue: 'Hotel Belvedere, Nashik',
      date: '15 February 2027',
      time: '8:00 pm onwards',
    },
  ],

  /* Scene 4 destination cards */
  SPLIT: {
    left: { big: 'DUBAI', small: 'work' },
    right: { big: 'MASTERS', small: 'study' },
  },

  /* ------------------------------------------------------------- timings */
  /* Every scene's length in seconds. Tune freely — nothing else depends on
     absolute time. Total run time is the sum (currently 94s).               */
  SCENE_SECONDS: {
    /* Scene 1 is a cinematic, cutout-animated garden: it unfolds layer by
       layer with short holds, Rahul's entrance is a discrete cutout snap,
       and a curved camera-follow airplane transition carries into Arya's
       half. See scenes.js. */
    /* Each of these is its own content length plus a small tail — they
       are trimmed to match, because a scene that keeps running after its
       last beat is what makes an instant cut feel like a slow fade. */
    meetRahul: 12.35,
    meetArya: 6.4,
    /* BAM lands at 5.30 and is gone by 5.65; this used to run to 8.60,
       leaving ~3s of motionless campus after the collision before the cut.
       Scene 3 opens on the same static campus, so the cut is invisible and
       the dead time simply goes. */
    college: 6.2,
    together: 9.2,
    lifeHappened: 8.3,
    /* Ends the instant the travel line clears the frame — the exit is a
       transition, not a beat, so there is no tail after it. */
    oneDay: 6.65,
    paris: 18.7,
    celebrations: 24,
  },

  /* Seconds the card can be out of frame before the story resets. */
  RESET_AFTER_LOST: 2.5,

  /* --------------------------------------------------- drag interaction */
  /* Scene 6 holds the clock three times and lets the viewer pull the travel
     line forward to move the journey on. These tune that gesture. */
  DRAG: {
    /* how far a forward drag must travel to release the gate, as a fraction
       of the viewport's width, clamped so it is neither a twitch on a large
       screen nor a marathon on a small one */
    thresholdFrac: .16,
    thresholdMin: 56,
    thresholdMax: 200,
    /* seconds a gate waits before giving up and continuing on its own, so
       the story never dead-ends for someone who does not try the gesture */
    fallback: 6,
  },
  /* Pause at the end before the film loops. */
  LOOP_GAP: 1.6,

  /* --------------------------------------------------------------- stage */
  /* Landscape, matching the native pixel size of the Scene 1 garden art
     (assets/background/garden_*.png are 1672x941) so those three layers
     fill the frame edge to edge with no crop/stretch. Scenes authored for
     the old 1000x1500 portrait space (college onward) still read GY/CX
     from here and will need their own numbers revisited separately.

     w/h now match logicalW/H 1:1 (texture k = STAGE.w/logicalW = 1) —
     previously the backing texture was downsampled to 960x540 and then
     the AR plane (and the THREE.js CanvasTexture's own linear filtering)
     upscaled it back up on screen, which is what was softening the hobby
     icons in particular. Rendering at native resolution removes that
     downsample/upsample round-trip without touching a single asset. If
     this turns out to be too heavy on a low-end phone, the documented
     fallback (see README) is to lower fpsCap or these two numbers, not to
     re-introduce a mismatch between texture and art resolution. */
  STAGE: {
    w: 1672,         // texture size (backing store) == the garden art's native width
    h: 941,          // == the garden art's native height
    logicalW: 1672,  // authoring space — the garden art's native width
    logicalH: 941,   // the garden art's native height
    groundY: 740,    // where characters stand (1180 scaled from the old 1500-tall space)
    fpsCap: 30,      // texture uploads per second
    choppy: 14,      // animatic "step" rate for character motion (0 = smooth)
  },

  /* --------------------------------------------------------------- fonts */
  /* When the handwriting/display font arrives, change these two strings. */
  FONTS: {
    display: "800 {size}px 'Baloo 2', 'Trebuchet MS', sans-serif",
    script: "700 {size}px 'Caveat', 'Segoe Script', cursive",
    body: "600 {size}px 'Baloo 2', 'Trebuchet MS', sans-serif",
    /* Scene 1 only — "meet the groom" / "meet the bride". */
    handwriting: "400 {size}px 'Patrick Hand', 'Segoe Script', cursive",
    /* Scene 4's "THEN LIFE HAPPENED" only. Modak ships a single weight. */
    title: "400 {size}px 'Modak', 'Baloo 2', cursive",
  },

  /* ------------------------------------------------------------- colours */
  /* Sampled from the character artwork so new graphics stay in the family. */
  PALETTE: {
    paper: '#f3efe6',
    ink: '#241d18',
    marigold: '#e9a72c',
    chilli: '#b8362c',
    rose: '#e0757d',
    leaf: '#2f5a43',
    navy: '#26314f',
    sky: '#cfe2ea',
    shadow: 'rgba(36,29,24,0.16)',
  },

  /* -------------------------------------------------------------- assets */
  /* key: filename under assets/. Swap a file and the whole film updates.   */
  ASSETS: {
    /* Scene 1 environment layers (parallax, all same frame, stacked). */
    gardenBg: 'background/garden_background.png',
    gardenMid: 'background/garden_midground.png',
    gardenFg: 'background/garden_foreground.png',

    /* Scene 2 environment layers — same three-layer structure as Scene 1:
       collegeBg is the whole opaque campus, collegeMid/collegeFg are
       transparent corner vignettes that frame it. */
    collegeBg: 'background/college_background.png',
    collegeMid: 'background/college_midground.png',
    collegeFg: 'background/college_foreground.png',

    /* Scene 2 characters. The 'pose'/'intro' art is how they walk in; the
       'college' art is the startled face they swap to on the bump. */
    rahulCollege: 'characters/rahul_college.png',
    aryaCollege: 'characters/arya_college.png',

    /* Scene 1's settled pose, swapped in on the introduction text beat. */
    rahulPose: 'characters/rahul_pose.png',
    aryaPose: 'characters/arya_pose.png',

    /* Scene 2 impact graphic — the only BAM artwork in the film. */
    bam: 'icons/bam.png',

    /* Scene 3's four story beats. 'phone'/'heart' are the real filenames
       on disk; the older 'phones' key below points at a file that is not
       in the project. */
    phone: 'icons/phone.png',
    heart: 'icons/heart.png',

    /* Scene 4 — the forked path. Scene 4 uses a flat backdrop rather
       than an illustrated one, so road_background.png is not loaded. */
    roadFg: 'background/road_foreground.png',

    /* Scene 6 — the airport, same three-layer structure as the garden and
       the campus: an opaque interior plus two corner vignettes. */
    airportBg: 'background/airport_background.png',
    airportMid: 'background/airport_midground.png',
    airportFg: 'background/airport_foreground.png',
    rahulAirport: 'characters/rahul_airport.png',
    aryaAirport: 'characters/arya_airport.png',
    /* how they arrive, before the reunion pose swap, and what they wheel
       in with */
    rahulFrance: 'characters/rahul_france.png',
    aryaFrance: 'characters/arya_france.png',
    rahulSuitcase: 'icons/rahul_suitcase.png',
    aryaSuitcase: 'icons/arya_suitcase.png',

    /* Scene 6's later stops — the world changes around the couple while
       they stay put. Same three-layer structure throughout. */
    /* These three are now two-layer: the replacement art has no midground
       files, and the river's "foreground" IS the boat the couple ride in.
       They are also 1536x1024 / 2172x724 rather than the stage's 1672x941,
       so scenes.js fits them to width instead of stretching them to frame. */
    riverBg: 'background/river_background.png',
    riverFg: 'background/river_foreground.png',
    louvreBg: 'background/louvre_background.png',
    louvreFg: 'background/louvre_foreground.png',
    eiffelBg: 'background/eiffel_background.png',
    eiffelFg: 'background/eiffel_foreground.png',
    rahulBigHappy: 'characters/rahul_big_happy.png',
    aryaBigHappy: 'characters/arya_big_happy.png',
    rahulPropose: 'characters/rahul_propose.png',

    /* Scene 1 character art — distinct from the generic 'rahul'/'arya' poses
       below, which the later scenes (college onward) still use unchanged. */
    rahulIntro: 'characters/rahul_intro.png',
    aryaIntro: 'characters/arya_intro.png',
    /* Discrete pose swap the moment each name's title text appears — no
       crossfade, a stop-motion pose change. */
    rahulHappy: 'characters/rahul_happy.png',
    aryaHappy: 'characters/arya_happy.png',

    /* Scene 1's standalone airplane — separate from the bubble that pops to
       release it, and separate from the unrelated 'airplane' icon below
       (which oneDay/paris still use for their own two-plane sequence). */
    travelAirplane: 'icons/travel_airplane.png',

    rahul: 'characters/rahul_casual.png',
    arya: 'characters/arya_casual.png',

    rahulWed: 'characters/rahul_wed_turban.png',
    rahulWedCheer: 'characters/rahul_wed_cheer.png',
    rahulWedDance: 'characters/rahul_wed_dance.png',
    rahulWedIdle: 'characters/rahul_wed_idle.png',
    aryaWed: 'characters/arya_wed_namaste.png',
    aryaWedWave: 'characters/arya_wed_wave.png',
    aryaWedBlush: 'characters/arya_wed_blush.png',
    aryaWedPoint: 'characters/arya_wed_point.png',

    /* Scene 7, sangeet — two alternate poses of the couple dancing, plus the
       two hanging decorations that frame the card. The disco ball's own
       sparkles are painted into its PNG; the twinkles scenes.js adds are
       drawn on top with canvas primitives, never by animating the art. */
    sangeet1: 'characters/sangeet_1.png',
    sangeet2: 'characters/sangeet_2.png',
    lights: 'icons/lights.png',
    discoball: 'icons/discoball.png',

    /* Scene 7, wedding — the varmala, two alternate poses, and the two
       hanging decorations that frame it left and right. */
    wedding1: 'characters/wedding_1.png',
    wedding2: 'characters/wedding_2.png',
    garlands: 'icons/garlands.png',
    umbrella: 'icons/umbrella.png',

    /* Scene 7, reception — two alternate poses plus the hanging strings
       and chandelier that frame them left and right. */
    reception1: 'characters/reception_1.png',
    reception2: 'characters/reception_2.png',
    strings: 'icons/strings.png',
    chandelier: 'icons/chandeliar.png',

    coupleSangeet: 'characters/couple_sangeet.png',
    coupleReception: 'characters/couple_reception.png',

    flowers: 'icons/flowers.png',
    butterflies: 'icons/butterflies.png',
    chai: 'icons/chai.png',
    food: 'icons/food.png',
    phones: 'icons/phones.png',
    airplane: 'icons/airplane.png',
    suitcases: 'icons/suitcases.png',
    franceFlag: 'icons/france_flag.png',
    eiffel: 'icons/eiffel.png',
    louvre: 'icons/louvre.png',
    seine: 'icons/seine.png',
    ring: 'icons/ring.png',
    sparkle: 'icons/sparkle.png',
    college: 'icons/college.png',
    road: 'icons/road.png',
    airport: 'icons/airport.png',

    /* Scene 1 hobby badges. */
    cricket: 'icons/cricket.png',
    travel: 'icons/travel.png',
    music: 'icons/music.png',
    photography: 'icons/photography.png',
    painting: 'icons/painting.png',
    dancing: 'icons/dancing.png',
    hiking: 'icons/hiking.png',
    baking: 'icons/baking.png',
  },

  /* --------------------------------------------------------------- cast */
  /* Which artwork each beat uses, and the little circled interests. */
  CAST: {
    groomInterests: ['cricket', 'photography', 'music', 'travel'],  // travel must stay last — it launches the airplane transition
    brideInterests: ['painting', 'dancing', 'hiking', 'baking'],
    celebrations: [
      { mode: 'pair', a: 'coupleSangeet', glasses: true },
      { mode: 'solo', groom: 'rahulWed', bride: 'aryaWed',
        groomAlt: 'rahulWedCheer', brideAlt: 'aryaWedWave' },
      { mode: 'pair', a: 'coupleReception', confetti: true },
    ],
  },

  /* -------------------------------------------------------------- marker */
  MARKER: {
    /* 'hiro' works with no setup at all — print assets/marker/hiro.png or
       show it on another screen. Switch to 'pattern' once you have trained
       your invitation card at https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html */
    type: 'hiro',                        // 'hiro' | 'pattern'
    patternUrl: 'assets/marker/invite.patt',
    /* How far above the card the film floats, and how big it is, in card
       widths. The plane's aspect ratio always matches STAGE.w/STAGE.h
       (main.js computes it from that), so it's landscape now. */
    height: 1.45,
    scale: 2.5,
    smoothing: { count: 5, tolerance: 0.02, threshold: 5 },
  },
};

window.CONFIG = CONFIG;
