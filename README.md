# Right Door, Wrong Exit

A single-page, click-through liminal-space walkthrough in the backrooms genre. It opens on an
arcade-cabinet title card with a **START** button; starting the walk drops you into a loading
screen — the clip alone, no overlay — that runs for five seconds and then glitches into the
first room. Each room plays a looping video behind a
typewritten caption, and once the caption finishes typing a **NEXT** button appears. For a room
that has a **3D scene**, NEXT glitches you *into* the room you were just looking at, in first
person, and you have to walk to its exit — the stairs, the end of the hall — before the next
loading screen plays. Rooms without a scene yet go straight to the loading screen, the glitch,
the next room. Seven rooms later the loop returns you to the title card.

Built with plain HTML, CSS, and JavaScript — no framework, no build step. The only dependency is
a vendored copy of [three.js](https://threejs.org/) r160 (MIT, `vendor/three/`) for the 3D scenes.

## The loop

```
gate ──click──▶ 0.PNG (home) ──START──▶ a.MP4 (plays in full) ──glitch──▶ A.mp4 (room + caption)
                              ▲                                              │
                              │                                            NEXT
                              │                                              ▼
                              │                    3D walk: reach the exit (rooms that have one)
                              │                                              │
                              └────── b.MP4 … g.MP4 ◀── fade to black ───────┘
```

| Room | Video | Loading clip | Audio | 3D walk | Phase |
| --- | --- | --- | --- | --- | --- |
| The Dining Room — The Anchor | `A.mp4` | `a.MP4` | `A.mp3` | `dining` · find the stairs | 1 · The Departure from Reality |
| The Hallway — The Descent | `B.mp4` | `b.MP4` | `B.mp3` | `hallway` · walk to the end | 1 · The Departure from Reality |
| Teal Room, Square Door — The Glitch | `C.mp4` | `c.MP4` | `C.mp3` | — | 2 · The Holding Cells |
| Teal Room, Arched Door — The Mutation | `D.MP4` | `d.MP4` | `D.mp3` | — | 2 · The Holding Cells |
| Flooded Corridor — The Decay | `E.mp4` | `e.MP4` | `E.mp3` | — | 3 · The System Breakdown |
| Trampoline Park — The Macro-Structure | `F.mp4` | `f.MP4` | `F.mp3` | — | 4 · The Empty Expanse |
| Grocery Store — The Anomaly | `G.mp4` | `g.MP4` | `G.mp3` | — | 4 · The Empty Expanse |

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
| `SKIP` tab | straight to the loading screen |

### Scenes

- **`dining`** — the Dining Room: cream plaster walls, green shag carpet, the round maple table
  and four arrow-back chairs, the sideboard with its green ceramic lamp, the wall of family
  photographs, sheer curtains, a light switch, and the dark, steep, green-carpeted stairwell in
  the back wall. Reaching its foot climbs you up towards the door at the top.
- **`hallway`** — the Hallway, rebuilt from `liminal_hallway_v2.blend`: 36 m of mustard
  wallpaper, grey carpet and tile ceiling, nine fluorescent panels, nine doors a side (the
  second on the left is a humming vending machine), outlets, baseboards, and a sign band at the
  far end that reads THE END.

A chapter names its scene with `walk: '<id>'` in `CHAPTERS`; `walk/walk.js` maps ids to
`walk/scenes/<id>.js`. A scene module exports `meta` (objective, arrival prompt, start position)
and `build({ quality, yieldFrame })`, which returns the batched geometry group, the lights, the
AABB colliders, the walkable bounds, the trigger and near-goal boxes, the exit camera path, fog
and exposure. The rooms after the hallway do not have scenes yet: they still go straight to the
loading screen.

### Built for phones

- **Nothing to download but three.js.** Every texture — carpet pile, plaster, wood grain,
  curtain pleats, ceiling tiles, the wallpaper, the faded photos — is generated on the device from
  seeded noise (`walk/textures.js`) with normal and roughness maps, at 512 px on a phone and
  1024 px on a desktop. Generation is spread over idle callbacks while the room video plays, so
  the video never stutters.
- **The room is built while you read the caption**, and its shaders are compiled then, so NEXT
  drops straight in.
- **One draw call per material**: geometry is merged per material (`walk/build.js`), which puts
  the dining room at ~30 draw calls / ~8k triangles and the hallway at ~16 / ~1.3k.
- **Static shadow maps**: the dining room's two shadow-casting lamps render their shadow maps
  once per walk; the hallway uses a constant pool of three lights that re-park on the nearest
  fluorescent panels as you walk, so the shaders never recompile.
- **Adaptive resolution**: the pixel ratio drops when frames run long and climbs back when
  there is headroom. No post-processing pass; AgX tone mapping in the renderer.
- Collision is circle-vs-box sliding (everything in these rooms is a box), and a portrait phone
  gets a taller field of view.
- If the module or WebGL is unavailable (an old browser, a blocked fetch) the game falls back
  to the loading screen as before.

### Testing

`tools/walk_test.mjs` drives the real page in headless Chromium (software WebGL): through the
gate and START, into room A, NEXT into the dining room, screenshots, keyboard walking, collision
against the table, the walk to the stairs and the exit, the loading screen for B, then the
hallway and the loading screen for C. It reports draw calls, triangles and console errors, and
writes `tools/out/*.png` and `report.json` (git-ignored).

```bash
node tools/walk_test.mjs            # desktop viewport
node tools/walk_test.mjs --mobile   # 390×844, touch, 2× DPR
```

Playwright and Chromium are found at their usual global locations (`CHROMIUM=` overrides).

## Structure

- `index.html` — four stacked screens (home / loading / room / walk) plus the glitch veil and log
  panel, and the import map for three.js.
- `styles.css` — screen layout, glitch and flicker animations, typewriter card, log panel, walk HUD
  (objective, hint, joystick, fade).
- `script.js` — the `CHAPTERS` array (captions, log entries, titles, filenames, walk scene ids)
  and the state machine that drives home → load → glitch → room → next → walk → load.
- `walk/walk.js` — the walk runtime: renderer, scene registry, prepare/start/skip, adaptive
  resolution, the exit animation. `walk/controls.js` (movement, look, touch), `walk/build.js`
  (materials, batching, colliders), `walk/textures.js` (procedural maps),
  `walk/scenes/dining.js`, `walk/scenes/hallway.js`.
- `vendor/three/` — three.js r160 (MIT) and the three addons the walk uses.
- `tools/walk_test.mjs` — the browser test.
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
