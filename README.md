# Right Door, Wrong Exit

A single-page, click-through liminal-space walkthrough in the backrooms genre. It opens on an
arcade-cabinet title card with a **START** button; starting the walk drops you into a loading
screen — the clip alone, no overlay — that runs for five seconds and then glitches into the
first room. Each room plays a looping video behind a
typewritten caption, and once the caption finishes typing a **NEXT** button appears. NEXT then glitches you
*into* the room you were just looking at, in first person, and you have to walk to its exit —
the stairs, the end of the hall, the couch, the arch, the grate, the red glow, the EXIT door —
before the next loading screen plays. Every room has a 3D scene; after the last one the loop
returns you to the title card.

Built with plain HTML, CSS, and JavaScript — no framework, no build step. The only dependency is
a vendored copy of [three.js](https://threejs.org/) r160 (MIT, `vendor/three/`) for the 3D scenes.

## The loop

```
gate ──click──▶ 0.PNG (home) ──START──▶ a.MP4 (plays in full) ──glitch──▶ A.mp4 (room + caption)
                              ▲                                              │
                              │                                            NEXT
                              │                                              ▼
                              │                    3D walk: reach the room's exit
                              │                                              │
                              └────── b.MP4 … g.MP4 ◀── fade to black ───────┘
```

| Room | Video | Loading clip | Audio | 3D walk | Phase |
| --- | --- | --- | --- | --- | --- |
| The Dining Room — The Anchor | `A.mp4` | `a.MP4` | `A.mp3` | `dining` · find the stairs | 1 · The Departure from Reality |
| The Hallway — The Descent | `B.mp4` | `b.MP4` | `B.mp3` | `hallway` · walk to the end | 1 · The Departure from Reality |
| Teal Room, Square Door — The Glitch | `C.mp4` | `c.MP4` | `C.mp3` | `teal` · find somewhere to rest | 2 · The Holding Cells |
| Teal Room, Arched Door — The Mutation | `D.MP4` | `d.MP4` | `D.mp3` | `teal2` · get through the arch | 2 · The Holding Cells |
| Flooded Corridor — The Decay | `E.mp4` | `e.MP4` | `E.mp3` | `flooded` · reach the red door | 3 · The System Breakdown |
| Trampoline Park — The Macro-Structure | `F.mp4` | `f.MP4` | `F.mp3` | `trampoline` · keep moving | 4 · The Empty Expanse |
| Grocery Store — The Anomaly | `G.mp4` | `g.MP4` | `G.mp3` | `grocery` · find the exit | 4 · The Empty Expanse |

The home screen runs on `0.PNG` and `0.mp3`.

## Running locally

Serve the directory with any static file server (the videos need to be fetched over HTTP, not
opened via `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`.

## The 3D walk

After the Chronicle Museum walkthrough (`Earth_Worldbuild/_Museum`), each scene is a first-person
room built in three.js from code — no model downloads. Pressing NEXT in a room that has a scene
glitches into it; an objective sits at the top of the screen (**FIND THE STAIRS**, **WALK TO THE
END**) and changes to the arrival prompt (**GO UP**, **THE END**) as you get close. Stepping onto
the exit hands the camera over for a short climb or approach, fades to black, and the next
chapter's loading screen plays, its audio track starting as usual. A white **SKIP** tab is offered
during a walk, as on the loading screens, so a room is never a dead end.

| Input | Action |
| --- | --- |
| `W A S D` / arrows | walk |
| mouse | look (click the room to capture the mouse; click-drag works if the browser refuses Pointer Lock) |
| touch | left half of the screen: a thumb joystick appears where you press · right half: drag to look |
| `E` / `Space` / `Enter` / click | use the thing in front of you, when the prompt offers it (on a phone, tap the prompt) |
| `SKIP` tab | straight to the loading screen |

### Scenes

- **`dining`** — the Dining Room: cream plaster walls, green shag carpet, the round maple table
  and four arrow-back chairs, the sideboard with its green ceramic lamp, the wall of family
  photographs, sheer curtains, a light switch, and the dark, steep, green-carpeted stairwell in
  the back wall. Reaching its foot climbs you up towards the door at the top. Someone was getting
  ready for guests: the good china stands in crooked towers in the corner beside the folded
  tablecloths, and a short stack waits on the sideboard.
- **`hallway`** — the Hallway, built to its room video: you start on a lower landing at the
  foot of a short carpeted flight (two wide low treads, then five steps) that climbs into a
  long, narrow corridor of pale plaid-printed walls, a worn tan diamond-pattern carpet, and
  surface-mounted twin-tube fluorescents that flicker one at a time while the buzz gets louder
  the further you walk. At the far end an amber-lit vestibule, its ceiling stacked with light
  bars, and under it a stairwell of mossy pixel-block stone going **down**, into the shaft of
  the next loading clip.
- **`teal`** — Teal Room, Square Door: the clean teal box, cream ceiling, coarse brown flecked
  carpet, the orange angular leather sofa, the plain doorway that is pitch black (it blocks: "it
  just swallows it"), the little blocky plant, and from the log a fake window whose sun never
  moves and a watch on the HUD that runs backward. Reach the couch and close your eyes; the
  next clip is the sleeper on it.
- **`teal2`** — Teal Room, Arched Door: the same room, wrong. You wake up low beside a rounded
  cognac sofa and stand; the room is narrower, the doorway is a black arch, the plant is tall
  and spiky. Patches of wallpaper are peeled back on a glowing green grid that pulses; the walls
  breathe; the patches shift when you are not looking; a hum rises the closer you get. Get
  through the arch before it finishes.
- **`flooded`** — Flooded Corridor: white tile to hip height, steel handrails, a painted sky
  along the whole left wall, empty wooden frames down the right, square recessed light panels,
  the yellow tactile strip, and a skin of standing water that mirrors the lights (the room is
  drawn again upside down under a glossy floor: no render target, one extra draw call per
  material). Drips fall from the ceiling as square blue blocks that melt into puddles; the
  corridor groans. The red door at the end is the lure: the grate in front of it sags underfoot,
  then gives way, and you fall into the riveted shaft of the next clip. Against the painted sky,
  heaps of sodden cardboard boxes and wet paper, slumped where the water left them; on the first,
  three photographs, still dripping.
- **`trampoline`** — Trampoline Park: black beds edged in yellow set in orange padded frames,
  pale pads between, padded columns, angled bed walls, a dark truss ceiling with a lattice of
  LED panels, and the concrete apron you land on. One 28 m cell of it is drawn four times
  (instanced) and you are wrapped back onto it: the ground repeats, the same scuff mark passes
  under your feet, DISTANCE reads NaN. After a hundred metres or so a digital chime sounds and
  a single red glow appears on the horizon. Head for it; the next clip's radar finds it.
- **`grocery`** — Grocery Store: glossy speckled vinyl, an acoustic-tile ceiling with continuous
  fluorescent rows (the left one flickers), cream columns, empty grey gondola shelving, and in a
  clearing at the heart of it the red cart roped off with sagging caution tape. The shelving is
  a **maze** (a seeded perfect maze with a few loops, generated at build time; the test checks
  it is solvable): the entrance doors behind you are black glass and locked, the anomaly pings
  when you come near the cart, and the lit EXIT sign shows over the shelves on the far wall.
  Find the way. The exit closes the loop: a fade, and the title card. The shelves were stripped,
  but what was left has been pushed into the dead ends of the aisles: pyramids of identical
  unlabelled tins with flats of cardboard beside them. In three of them one tin is red.

### Mini games

Three rooms have one, and each is a bonus: the exit is open from the start and the game never
touches it, so rushing through (or SKIP) works as before. A line under the readout keeps the
score. The things you can use are targets: when you stand within reach and look at one, a prompt
appears under the middle of the screen (`E · TAKE THE RED TIN`; on a phone it is a button,
`TAP · …`), and `E`, `Space`, `Enter` or a click uses it.

| Room | Game | Win |
| --- | --- | --- |
| `dining` | **Lights Out**: every time the lamp clicks off, one of the photographs on the wall changes (turned upside down, gone to grey lines, gone dark). Every photo is a target while a change is waiting, so the prompt (`THAT ONE?`) gives nothing away; a wrong guess counts nothing. | three found: the lamp stays on, and the room holds still |
| `flooded` | **Fill the Frames**: take the photographs off the sodden heap, one at a time, and hang them in the empty frames down the right. | three hung: the corridor stops groaning for a while, and the painted sky's clouds start to drift |
| `grocery` | **Shopping List**: find the three red tins in the dead-end pyramids, then put them in the roped-off cart. | the cart has its tins: `PING_ACKNOWLEDGED`, and the anomaly and the flickering row hold steady |

### Piles

Every pile belongs to one room: the china and linen in the dining room, the sodden boxes and
paper in the flooded corridor, the tins and cardboard flats in the grocery store's dead ends.
They are built by the seeded generators in `walk/piles.js` (`pyramid`, `stack`, `heap`) through
the room's builder, so a pile costs one draw call per material however many pieces it has, and
looks the same on every visit. Every pile is solid (an AABB collider). A game's item (a red tin,
a photograph) is drawn on its own, so it can be taken away while the pile and its collider stay
put. The grocery piles go only in dead ends, where nothing lies beyond them, so no aisle is ever
blocked.

### What moves

Each room video is a fixed-camera, five-second loop with one thing happening in it, and each
3D room plays the same beat, stretched to a 20–40 s cycle so it comes round whether you rush
or dawdle (`cycle()` and the hash-driven `stutter()` in `walk/build.js` keep it deterministic;
`prefers-reduced-motion` turns the strobes into slow fades):

| Room | In the clip | In the room |
| --- | --- | --- |
| `dining` | still, then the green lamp clicks off at 4.35 s | every 28 s the lamp clicks off for three seconds (light, bulb and shade), with a switch click |
| `hallway` | one fluorescent tube at a time greys out and comes back | nine fixtures with a material each, stuttering one at a time; the buzz rises down the hall; the amber bars breathe |
| `teal` | the black of the doorway lifts for a moment at the end | every 24 s the doorway lifts to charcoal and swallows again; the camera drifts if you stand still |
| `teal2` | a slow low push toward the arch, the leaves stirring | you drift toward the arch as you stand; the plant sways; the arch keeps growing and snaps back |
| `flooded` | the water shimmers; the red door is lit, then dark, then stutters on | two water skins scrolled against each other; a 30 s door cycle: lit, dark for a long while, stutter, steady |
| `trampoline` | the LED lattice pulses and flickers | the LEDs breathe on a 2.3 s sine with a hash-driven stutter; the panel lights follow |
| `grocery` | the tube rows breathe, with a hard dip and a smaller one | all rows breathe; twice a 9 s loop the store dips (the left row still flickers on its own) |

A chapter names its scene with `walk: '<id>'` in `CHAPTERS`; `walk/walk.js` maps ids to
`walk/scenes/<id>.js`. A scene module exports `meta` (objective, arrival prompt, start position,
optionally `riseFrom` to wake up low) and `build({ quality, yieldFrame })`, which returns the
batched geometry group, the lights, the AABB colliders, the walkable bounds, the trigger and
near-goal boxes, the exit camera path (an array, or a function of where the player is), the
exit's duration / easing / fade / shake, fog and exposure, and optionally `update(pos, dt,
camera, ctx)` for animation (drips, flicker, breathing walls, the light pool) and `wrap(pos)` for
an endless floor. A mini game adds `interact`, a list of targets (`{ x, y, z, reach, size, label,
enabled(), use(ctx) }`, picked by `walk/play.js`), and optionally `dispose()` for anything the
scene swapped out of its materials. `ctx` lets a scene change the objective, write the readout
and tally lines, and play the synthesized sounds (`walk/sound.js`: hum, buzz, chime, drip,
groan, ping, click, and pickup, wrong and win for the games), which follow the SOUND toggle.
`?chapter=C` in the URL makes START open on that room.

### Built for phones

- **Nothing to download but three.js.** Every texture — carpet pile, plaster, wood grain,
  curtain pleats, ceiling tiles, the wallpaper, the faded photos — is generated on the device from
  seeded noise (`walk/textures.js`) with normal and roughness maps, at 512 px on a phone and
  1024 px on a desktop. Generation is spread over idle callbacks while the room video plays, so
  the video never stutters.
- **The room is built while you read the caption**, and its shaders are compiled then, so NEXT
  drops straight in.
- **One draw call per material**: geometry is merged per material (`walk/build.js`), and the
  trampoline park's cell is instanced. Draw calls per room run from 14 (teal) to 45 (the grocery
  maze with its piles and floor reflection); every room keeps a constant number of lights.
- **Static shadow maps**: the rooms with shadow-casting lamps render their shadow maps once per
  walk; the long rooms use a constant pool of lights that re-park on the nearest fixtures as you
  walk, so the shaders never recompile.
- **Adaptive resolution**: the pixel ratio drops when frames run long and climbs back when
  there is headroom. No post-processing pass; AgX tone mapping in the renderer.
- Collision is circle-vs-box sliding (everything in these rooms is a box), and a portrait phone
  gets a taller field of view.
- If the module or WebGL is unavailable (an old browser, a blocked fetch) the game falls back
  to the loading screen as before.

### Testing

`tools/walk_test.mjs` drives the real page in headless Chromium (software WebGL). For every
chapter it opens `index.html?chapter=<id>`, goes through the gate and START, ends the caption,
presses NEXT, and drives the room with deterministic steps: screenshots, the room's own checks
(the table and the black doorway block, the watch runs backward, you wake up low and stand, the
grid pulses, the drips fall, the park wraps and the chime brings the glow, the maze has a route
and the light row flickers, and every room's animation plays: the lamp clicks off, the tubes
flicker one at a time, the doorway lifts, the arch grows, the red door lights, the LEDs pulse,
the rows dip), the piles and the mini games (the china, the sodden heap and a pyramid of tins
block you, and a pyramid still does once its red tin is gone; the grocery piles sit only in dead
ends; each game is played through with "use", by a tap on the prompt in `--mobile`, and the
exit was open before it), the scripted route to the exit, and then that the right loading
clip (or the title card, after the grocery store) follows. It reports draw calls, triangles and
console errors, and writes `tools/out/*.png` and `report.json` (git-ignored).

```bash
node tools/walk_test.mjs                    # desktop viewport, all chapters
node tools/walk_test.mjs --mobile           # 390×844, touch, 2× DPR
node tools/walk_test.mjs --scene teal,G     # some chapters (scene id or letter)
node tools/scene_shot.mjs flooded --view "grate:29,1.62,0,-1.57,-0.3"   # look-dev shots
```

`tools/scene.html?scene=<id>` runs a room on its own (what `scene_shot.mjs` drives).

Playwright and Chromium are found at their usual global locations (`CHROMIUM=` overrides).

## Structure

- `index.html` — four stacked screens (home / loading / room / walk) plus the glitch veil and log
  panel, and the import map for three.js.
- `styles.css` — screen layout, glitch and flicker animations, typewriter card, log panel, walk HUD
  (objective, readout, tally, use prompt, hint, joystick, fade).
- `script.js` — the `CHAPTERS` array (captions, log entries, titles, filenames, walk scene ids)
  and the state machine that drives home → load → glitch → room → next → walk → load.
- `walk/walk.js` — the walk runtime: renderer, scene registry, prepare/start/skip, adaptive
  resolution, the exit animation, the scene context. `walk/controls.js` (movement, look, touch,
  head bob, the use key), `walk/build.js` (materials, batching, instancing, the mirrored floor,
  colliders), `walk/play.js` (the mini games' targets and prompt), `walk/piles.js` (the seeded
  pile generators), `walk/textures.js` (procedural maps and canvas paintings), `walk/sound.js`
  (synthesized sounds), and the rooms in `walk/scenes/`: `dining`, `hallway`, `teal` and `teal2` (sharing
  `teal_common.js`), `flooded`, `trampoline`, `grocery`.
- `vendor/three/` — three.js r160 (MIT) and the three addons the walk uses.
- `tools/walk_test.mjs` — the browser test; `tools/scene.html` + `tools/scene_shot.mjs` — the scene viewer.
- `0.PNG` — the arcade-cabinet home screen.
- `A.mp4` … `G.mp4` — the seven room videos.
- `a.MP4` … `g.MP4` — the seven loading-screen clips, one per room.
- `0.mp3` — the home screen's audio track.
- `A.mp3` … `G.mp3` — one audio track per room, started by the room's loading screen.

## Notes

- **Filenames are case-sensitive.** The loading clips (`a.MP4`) and room videos (`A.mp4`) differ
  only by case, which is fine on GitHub Pages and other Linux hosts. Cloning onto a
  case-insensitive filesystem (default macOS/Windows) will collide those pairs — work with the
  files through GitHub, or rename them before cloning locally.
- Captions type themselves out character by character; clicking the paper card (or pressing
  Enter/Space) skips to the end of the caption. Enter/Space also works for START and NEXT.
- `CAPTION_HOLD_MS` after a caption finishes typing, the card fades out and leaves the room on
  its own. NEXT stays put.
- The `LOG` tab on the right slides out the in-world log entry for the room you're standing in.
- A loading screen is the clip and nothing else: while `body.phase-load` is set, the scanline
  overlay, the vignette, the sound toggle and the LOG tab are all hidden, and the video isn't
  crop-scaled.
- It shows exactly `LOAD_SECONDS` (5.0) of clip, counted in playback time, not wall-clock: the
  count starts when the video actually starts and pauses while it buffers, so a slow clip still
  gets its full five seconds. Three ceilings sit behind it so a loading screen can never hang:
  `LOAD_START_MS` (the clip never got going), `LOAD_STALL_MS` (the picture stopped moving) and
  `LOAD_CAP_MS` (absolute). The stall guard re-arms only on a real advance in `currentTime` — a
  `timeupdate` on its own is not proof of progress, since a stalled clip keeps firing them with
  the picture frozen.
- A white **SKIP** tab sits where the LOG tab does, but only while a clip is loading, so a slow
  or broken clip is never a dead end.
- The upcoming room video only starts downloading once the loading clip is actually playing, so
  the two aren't competing for the connection while the loading screen is what's on screen. The
  next room's loading clip is prefetched while you read the current room.
- Each section owns one audio track. `0.mp3` runs under the home screen; a room's track starts
  with its loading clip and keeps playing through the glitch and the room itself, so the four
  seconds of loading and the room that follows are one continuous piece of sound.
- The video clips are silent — muted in the markup and again in `script.js`, with nothing that
  ever unmutes them. The section track is the only sound. Muting them also keeps them from
  taking the audio session on mobile, which is what used to cut the track off when a room
  started. The track still reclaims playback if anything else pauses it (capped, and the sound
  toggle always wins).
- Browsers block audible playback until the visitor interacts with the page, so the site opens
  on a `CLICK ANYWHERE TO BEGIN` veil over the darkened title card. That one click (or keypress)
  is what lets `0.mp3` start; the veil then fades and leaves you on the home screen with START
  still to press. The `SOUND ON` toggle mutes and unmutes everything — section track and clip
  audio together.
- `prefers-reduced-motion` swaps the glitch for a plain fade and prints captions instantly; the
  loading screens still play in full either way.
