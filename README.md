# Right Door, Wrong Exit

A single-page, click-through liminal-space walkthrough in the backrooms genre. It opens on an
arcade-cabinet title card with a **START** button; starting the walk drops you into a loading
screen — the clip alone, no overlay — that plays all the way through and then glitches into the
first room. Each room plays a looping video behind a
typewritten caption, and once the caption finishes typing a **NEXT** button appears — clicking it
runs the next loading screen, the next glitch, the next room. Seven rooms later the loop returns
you to the title card.

Built with plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies.

## The loop

```
gate ──click──▶ 0.PNG (home) ──START──▶ a.MP4 (plays in full) ──glitch──▶ A.mp4 (room + caption)
                              ▲                            │
                              │                          NEXT
                              └────── b.MP4 … g.MP4 ◀──────┘
```

| Room | Video | Loading clip | Audio | Phase |
| --- | --- | --- | --- | --- |
| The Dining Room — The Anchor | `A.mp4` | `a.MP4` | `A.mp3` | 1 · The Departure from Reality |
| The Hallway — The Descent | `B.mp4` | `b.MP4` | `B.mp3` | 1 · The Departure from Reality |
| Teal Room, Square Door — The Glitch | `C.mp4` | `c.MP4` | `C.mp3` | 2 · The Holding Cells |
| Teal Room, Arched Door — The Mutation | `D.MP4` | `d.MP4` | `D.mp3` | 2 · The Holding Cells |
| Flooded Corridor — The Decay | `E.mp4` | `e.MP4` | `E.mp3` | 3 · The System Breakdown |
| Trampoline Park — The Macro-Structure | `F.mp4` | `f.MP4` | `F.mp3` | 4 · The Empty Expanse |
| Grocery Store — The Anomaly | `G.mp4` | `g.MP4` | `G.mp3` | 4 · The Empty Expanse |

The home screen runs on `0.PNG` and `0.mp3`.

## Running locally

Serve the directory with any static file server (the videos need to be fetched over HTTP, not
opened via `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`.

## Structure

- `index.html` — three stacked screens (home / loading / room) plus the glitch veil and log panel.
- `styles.css` — screen layout, glitch and flicker animations, typewriter card, log panel.
- `script.js` — the `CHAPTERS` array (captions, log entries, titles, filenames) and the state
  machine that drives home → load → glitch → room → next.
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
- The `LOG` tab on the right slides out the in-world log entry for the room you're standing in.
- A loading screen is just its clip, and lasts exactly as long as the clip does: it ends on the
  video's own `ended` event. The guard against a stuck clip (`LOAD_STALL_MS`) is measured from
  the last sign of playback progress, never from the wall clock — a clip that buffers slowly is
  still playing and must not be cut off for taking longer than its own duration to get through.
  `LOAD_CAP_MS` is a last-resort ceiling.
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
