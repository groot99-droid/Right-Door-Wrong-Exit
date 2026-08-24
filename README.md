# Right Door, Wrong Exit

A single-page, click-through liminal-space walkthrough in the backrooms genre. It opens on an
arcade-cabinet title card with a **START** button; starting the walk drops you into a four-second
loading screen that glitches into the first room. Each room plays a looping video behind a
typewritten caption, and once the caption finishes typing a **NEXT** button appears — clicking it
runs the next loading screen, the next glitch, the next room. Seven rooms later the loop returns
you to the title card.

Built with plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies.

## The loop

```
0.PNG (home) ──START──▶ a.MP4 (4s load) ──glitch──▶ A.mp4 (room + caption)
                              ▲                            │
                              │                          NEXT
                              └────── b.MP4 … g.MP4 ◀──────┘
```

| Room | Video | Loading clip | Phase |
| --- | --- | --- | --- |
| The Dining Room — The Anchor | `A.mp4` | `a.MP4` | 1 · The Departure from Reality |
| The Hallway — The Descent | `B.mp4` | `b.MP4` | 1 · The Departure from Reality |
| Teal Room, Square Door — The Glitch | `C.mp4` | `c.MP4` | 2 · The Holding Cells |
| Teal Room, Arched Door — The Mutation | `D.MP4` | `d.MP4` | 2 · The Holding Cells |
| Flooded Corridor — The Decay | `E.mp4` | `e.MP4` | 3 · The System Breakdown |
| Trampoline Park — The Macro-Structure | `F.mp4` | `f.MP4` | 4 · The Empty Expanse |
| Grocery Store — The Anomaly | `G.mp4` | `g.MP4` | 4 · The Empty Expanse |

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
- `ambient.mp3` — looping ambient audio, muted by default until the user opts in via the sound toggle.

## Notes

- **Filenames are case-sensitive.** The loading clips (`a.MP4`) and room videos (`A.mp4`) differ
  only by case, which is fine on GitHub Pages and other Linux hosts. Cloning onto a
  case-insensitive filesystem (default macOS/Windows) will collide those pairs — work with the
  files through GitHub, or rename them before cloning locally.
- Captions type themselves out character by character; clicking the paper card (or pressing
  Enter/Space) skips to the end of the caption. Enter/Space also works for START and NEXT.
- The `LOG` tab on the right slides out the in-world log entry for the room you're standing in.
- The loading screen serves double duty: it buffers the upcoming room video for its full four
  seconds, so the room is ready when the glitch lands.
- Videos autoplay muted (browser-compliant); the ambient audio track only plays once the user
  clicks the sound toggle.
- `prefers-reduced-motion` swaps the glitch for a plain fade and prints captions instantly; the
  four-second loading beat is kept either way.
