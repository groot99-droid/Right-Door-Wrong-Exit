# Right Door, Wrong Exit

A single-page, vertical "scroll reel" experience in the liminal-space / backrooms genre — seven full-screen video reels you scroll through like a TikTok/Reels feed, each with a typewritten note, a flickering fluorescent-tube title, and a slide-out "field notes" panel with the real-world lore behind the imagery (non-places, the Backrooms myth, the uncanny valley, etc).

Built with plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies.

## Running locally

Serve the directory with any static file server (the videos need to be fetched over HTTP, not opened via `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`.

## Structure

- `index.html` — the seven reel sections, each with its background video, header text, and typed note card.
- `styles.css` — scroll-snap layout, parallax, flicker/typewriter animations, notes panel.
- `script.js` — `IntersectionObserver`-driven section activation, typewriter effect, letter flicker, scroll parallax, sound toggle.
- `reel-01.mp4` … `reel-07.mp4` — background loop videos, one per reel.
- `ambient.mp3` — looping ambient audio, muted by default until the user opts in via the sound toggle.
- `Backrooms Reel (Mobile).dc.html` — a Claude Design canvas draft of a mobile layout variant; not wired into the live site.

## Notes

- Videos autoplay muted (browser-compliant); the ambient audio track only plays once the user clicks the sound toggle.
- Field notes content is defined per-section in `script.js` (`notes` object) and swaps in as you scroll.
