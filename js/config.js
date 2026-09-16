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
 
  /* Pause at the end before the film loops. */
  LOOP_GAP: 1.6,

  /* ---------------------------------------------------------------- drag */
  /* The airport gate (see PA_GATES in scenes.js / initDrag in main.js): the
     one point in the film where the viewer pulls the journey forward
     instead of it playing on its own. main.js reads every value here —
     without this block dragThreshold() and the gate's release check throw
     on the very first frame the clock parks, which freezes the film dead
     at that gate with no way to move it forward. */
  DRAG: {
    thresholdMin: 90,     // px — a full pull never asks for less than this,
    thresholdMax: 260,    // px — nor more than this, whatever the screen size
    thresholdFrac: 0.28,  // fraction of the viewport width, clamped by the two above
    fallback: 6,          // seconds to wait before the journey continues on its own
  },

  /* --------------------------------------------------------------- audio */
  /* One track, for the celebrations only — sangeet, wedding and reception
     are three cards of a single sequence, so they share a single soundtrack
     that runs from the first frame of SANGEET to the last frame of
     RECEPTION and never restarts in between. Scenes 1-6 are silent.
     Keep the volume in the 0.35-0.45 range: this is background music under
     a film with no dialogue, not the thing being listened to. */
  AUDIO: {
    celebrations: 'assets/audio/celebrations.mp3',
    volume: 0.38,
  },

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

  /* --------------------------------------------------------------- depth */
  /* The film is painted onto four separate panels standing on the card, so
     it reads as a paper diorama instead of one flat screen. Each panel gets
     its own canvas, its own texture and its own plane; they all lean back by
     MARKER.tiltDeg and all stand on the card, but sit at different distances
     along it — which is what produces the parallax when the phone moves.

     `keys` says which artwork lands on which panel. Anything NOT listed here
     (characters, props, icons, typography, effects) is painted on the
     'characters' panel, so new artwork needs no entry unless it is scenery.

     `depth` is how far each panel sits along the card, in card widths:
     negative is further back, positive is nearer the viewer, and the
     characters panel is the 0 reference so the existing composition stays
     exactly where it is today. The printed Hiro marker is 1 unit, so at an
     80mm card these span roughly 6mm in front to 44mm behind. Widen them for
     a stronger pop, narrow them if the panels start to look detached.

     ?preview=1 ignores all of this and draws the whole film onto one canvas,
     exactly as before. */
  LAYERS: {
    order: ['background', 'midground', 'characters', 'foreground'],
    keys: {
      background: ['gardenBg', 'collegeBg', 'airportBg', 'riverBg', 'louvreBg', 'eiffelBg'],
      midground: ['gardenMid', 'collegeMid', 'airportMid'],
      /* NOTE riverFg is deliberately NOT here. Every other *Fg is scenery
         standing in front of the couple, but the Seine's "foreground" IS the
         boat they are sitting in. On its own panel 0.22 in front of them the
         parallax pulled it off the couple, so it read as a boat-shaped card
         floating in front of two people rather than a hull they are inside.
         Painting it on the characters panel puts it back in the same picture
         as them, in the draw order the scene already uses — the hull covers
         their lower bodies, exactly as it does in preview. */
      foreground: ['gardenFg', 'collegeFg', 'airportFg', 'louvreFg', 'eiffelFg'],
      /* Art the couple physically TOUCH cannot live on its own panel. The
         foreground sits 0.22 in front of them, and on a phone that gap
         parallaxes the two apart: the Seine's boat drifted off the couple
         sitting in it, and the forked road slid out below and in front of
         the two standing on it, so they floated above a road that was no
         longer under their feet. Painting these on the characters panel
         puts them back in one picture, in the draw order the scenes already
         use — the road under their shoes, the hull over their legs. The
         *Fg keys left above are true scenery: corner vignettes and the two
         landmarks, none of which anybody stands on. */
      characters: ['riverFg', 'roadFg'],
    },
    depth: {
      background: -0.55,
      midground: -0.30,
      characters: 0,
      foreground: 0.22,
    },
  },

  /* ------------------------------------------------------------- preload */
  /* The artwork the FIRST TWO SCENES need, and nothing else. Only these are
     waited for before the film can start; every other key in ASSETS below is
     fetched straight afterwards, in the background, while the viewer is still
     finding the card and tapping to begin.

     The whole of ASSETS is 89 MB of PNG. Waiting for all of it before the
     first frame is what made the loading screen crawl on a phone: 85 images
     were requested at once, a mobile browser will only run about six of them
     at a time, and several are 2-3 MB each, so the early percentages moved at
     the speed of the largest files in the queue. This list is 24 MB — the
     same pictures, a 73% smaller gate.

     It is written out by hand on purpose. Scanning the scene code for asset
     names cannot be trusted: the hobby badges are named in CAST rather than
     in scenes.js, and the garden layers are drawn from a shared helper that
     belongs to no single scene, so an automatic scan silently misses them
     and the film opens with holes in it.

     If you add artwork to the opening, add its key here too. Getting it wrong
     is not fatal — a picture that has not arrived yet simply is not painted
     (see sprite() in engine.js) and appears as soon as it lands — but it is
     the difference between a clean open and a brief gap. */
  PRELOAD: [
    /* Scene 1's garden, all three layers */
    'gardenBg', 'gardenMid', 'gardenFg',
    /* Rahul and Arya, plus the poses they snap to on their title beats */
    'rahulIntro', 'aryaIntro', 'rahulHappy', 'aryaHappy', 'rahulPose', 'aryaPose',
    /* the hobby badges — named in CAST, not in scenes.js */
    'cricket', 'photography', 'music', 'travel',
    'painting', 'dancing', 'hiking', 'baking',
    /* the airplane that carries scene 1 into scene 2 */
    'travelAirplane',
  ],

  /* Fetched immediately after PRELOAD and before everything else, but NOT
     waited for — the film is already running by then. These are the hero
     pictures of the scenes furthest from the start, which is exactly why
     they were the ones that failed: the background phase works through
     ASSETS in declaration order, and rahul_propose (~67s) and wedding_2
     (~76s) sit late in that list, so on a phone the story reached them
     before the queue did. Both files exist and both keys are correct; they
     were simply last in line. Pulling them to the front of the background
     queue costs nothing at startup and gives them the whole film to
     arrive. */
  PRELOAD_NEXT: [
    'rahulPropose',
    'wedding1', 'wedding2',
    'sangeet1', 'sangeet2',
    'reception1', 'reception2',
  ],

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
    /* How far the film's bottom edge sits above the card surface, and how
       tall the standing plane is, in card widths. The plane's aspect ratio
       always matches STAGE.w/STAGE.h (main.js computes it from that), so
       it's landscape now. It stands upright, perpendicular to the card
       (see story-plane in main.js), not floating flat above it. */
    height: 1.45,
    scale: 2.5,
    /* Lean-back of the standing film, in degrees from vertical, hinged on
       the card's own left-right axis. The plane's face normal ends up this
       far above the card, so it is roughly the phone elevation the film
       reads best at. 0 keeps the film at a literal 90 deg to the card, but
       then it is only square-on from card level, with the phone looking
       along the card rather than down at it. 35 covers a phone held 40-80
       deg above the card; raise toward 45 to favour steeper, more overhead
       viewing, lower it toward 0 to favour a flatter, eye-level look. */
    tiltDeg: 35,
    /* Overall size of the whole diorama on screen. This is a uniform scale
       on the group that carries every panel, so panel size AND the depth
       spacing in LAYERS.depth grow together — the composition is identical,
       just bigger, and the parallax keeps its proportions. Prefer this over
       raising `scale` above, which would enlarge the panels while leaving
       the depths where they are and flatten the diorama out. The rise
       animation multiplies into this, so its timing is unaffected. */
    dioramaScale: 0.6,
    /* AR-ONLY vertical framing, in plane heights. Nothing in the artwork is
       mispositioned: "ONE DAY" sits at y 475 and "ON VACATION" at y 615 of a
       941-tall stage, and the first flight path enters at y 640 — all of
       which frame correctly in ?preview. What moves them is tiltDeg. The
       panels lean back, so seen from a phone held above the card the lower
       part of each panel is nearer the lens than the upper part, and
       perspective magnifies it and carries it toward (and past) the bottom
       of the screen. The title and the plane's entry arc both live in that
       lower band, which is why they alone read as "too low" on a phone and
       nowhere else.

       Lifting the whole diorama is the fix that leaves every coordinate,
       animation and pace alone: it raises the bottom band back into frame
       for every scene at once. Raise it if content still sits low on your
       phone, lower it toward 0 if the film starts floating off the card.
       This is applied in story-plane (main.js), which only ever runs in AR,
       so ?preview is untouched by it. */
    frameLift: 0.26,
    smoothing: { count: 5, tolerance: 0.02, threshold: 5 },
  },
};

window.CONFIG = CONFIG;
