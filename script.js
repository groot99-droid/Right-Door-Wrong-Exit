(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Chapters. Each entry pairs a loading clip (lowercase file) with the room
  // video it glitches into (uppercase file), plus its caption and log entry.
  // Filenames are case-sensitive and intentionally match the uploaded assets.
  // ---------------------------------------------------------------------------
  const CHAPTERS = [
    {
      id: 'A',
      audio: 'A.mp3',
      rot: '-1.2deg',
      phase: 'Phase 1 — The Departure from Reality',
      room: 'The Dining Room',
      epithet: 'The Anchor',
      load: 'a.MP4',
      video: 'A.mp4',
      caption: 'They said to wait in the dining room, but the house feels quiet. Too quiet. I don’t remember those stairs being so steep, or so dark. I think I have to go up.',
      stamp: '14:32',
      log: 'I shouldn’t have come down here. The carpet on these stairs smells like old ozone and dust, but I’ve been walking for what feels like hours. I look up, and the top of the stairwell is gone. It just loops. I have to keep going. There’s no other way.'
    },
    {
      id: 'B',
      audio: 'B.mp3',
      rot: '1.1deg',
      phase: 'Phase 1 — The Departure from Reality',
      room: 'The Hallway',
      epithet: 'The Descent',
      load: 'b.MP4',
      video: 'B.mp4',
      caption: 'The stairs didn’t lead to the second floor. I’ve been walking down this hall for what feels like hours. The hum of the lights is getting louder. I just need to find a door.',
      stamp: '18:15',
      log: 'Found a hallway. The doors don’t feel right. I touched the wood on one of them and my hand tingled, like static electricity. For a second, the grain on the wood just... disappeared into gray lines. I’m so tired. I just need to find a room to catch my breath.'
    },
    {
      id: 'C',
      audio: 'C.mp3',
      rot: '-0.8deg',
      phase: 'Phase 2 — The Holding Cells',
      room: 'Teal Room, Square Door',
      epithet: 'The Glitch',
      load: 'c.MP4',
      video: 'C.mp4',
      caption: 'Found a place to rest, but it doesn’t feel real. The air is entirely still. There’s no dust. That doorway... it doesn’t reflect any light. It just swallows it.',
      stamp: '27:81',
      log: 'Found a teal room. The time on my watch doesn’t make sense anymore. The second hand is ticking backward, but the sun outside the fake window never moves. I found an orange couch. I’m going to close my eyes. Just for a minute.'
    },
    {
      id: 'D',
      audio: 'D.mp3',
      rot: '1.6deg',
      phase: 'Phase 2 — The Holding Cells',
      room: 'Teal Room, Arched Door',
      epithet: 'The Mutation',
      load: 'd.MP4',
      video: 'D.MP4',
      caption: 'I closed my eyes for a second. The room is the same, but the door changed. The architecture is breathing. It’s shifting when I don’t look directly at it.',
      stamp: 'SysTime: 88:88',
      log: 'I woke up but the room is wrong. I peeled back some of the wallpaper. It’s not wood or brick underneath; it’s a green, glowing grid. The room wasn’t just sitting here while I slept—it rebuilt itself. The humming is getting louder. I have to get through that arched doorway before it finishes.'
    },
    {
      id: 'E',
      audio: 'E.mp3',
      rot: '-1.5deg',
      phase: 'Phase 3 — The System Breakdown',
      room: 'Flooded Corridor',
      epithet: 'The Decay',
      load: 'e.MP4',
      video: 'E.mp4',
      caption: 'The deeper I go, the more the illusion falls apart. They painted a sky on the wall to make us forget we’re buried. The water is freezing. Whatever is running this place is starting to break down.',
      stamp: 'ERR_CLOCK_NOT_FOUND',
      log: 'I broke through. It’s dark, and everything is wet. The water dripping from the ceiling doesn’t splash—it hits the ground as perfect, square blue blocks before melting into puddles. The environment is failing. I tried to walk across a grate but the metal felt soft. The whole corridor is groaning.'
    },
    {
      id: 'F',
      audio: 'F.mp3',
      rot: '0.9deg',
      phase: 'Phase 4 — The Empty Expanse',
      room: 'Trampoline Park',
      epithet: 'The Macro-Structure',
      load: 'f.MP4',
      video: 'F.mp4',
      caption: 'I fell through a vent and landed here. It goes on forever. A playground for no one. The silence is so heavy it’s pressing against my eardrums. I have to keep moving.',
      stamp: 'DISTANCE: NaN',
      log: 'I didn’t hit the ground, I just... landed. I’m in a massive room covered in orange and black trampoline padding. No walls. No ceiling. The ground repeats. The exact same scuff mark passes under my feet every hundred steps. I am on a treadmill. The geometry is a sphere. I’m trapped in a loop.'
    },
    {
      id: 'G',
      audio: 'G.mp3',
      rot: '-1.7deg',
      phase: 'Phase 4 — The Empty Expanse',
      room: 'Grocery Store',
      epithet: 'The Anomaly',
      load: 'g.MP4',
      video: 'G.mp4',
      caption: 'A grocery store, completely stripped. But right in the middle... a monument. Who roped off the cart? Am I following someone, or is the room trying to show me something?',
      stamp: 'PING_DETECTED_0x8F',
      log: 'Wait. Something changed. I heard a noise—a digital chime. I looked up and there is a single, bright red glow on the horizon. Out here? It’s an anomaly. It’s the only thing that isn’t supposed to be here. I’m heading for it.'
    }
  ];

  const HOME_AUDIO = '0.mp3';  // plays on the title card
  const VIDEO_VOLUME = 0.2;    // the clips' own sound, kept under the section track

  const LOAD_MS = 4000;        // loading screen duration before the glitch
  const GLITCH_MS = 900;       // total glitch length
  const GLITCH_SWAP_MS = 320;  // when, inside the glitch, the screens swap
  const TYPE_START_DELAY_MS = 700;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Elements --------------------------------------------------------------
  const body = document.body;
  const stage = document.getElementById('stage');
  const screenHome = document.getElementById('screenHome');
  const screenLoad = document.getElementById('screenLoad');
  const screenScene = document.getElementById('screenScene');

  const startBtn = document.getElementById('startBtn');
  const loadVideo = document.getElementById('loadVideo');
  const loadPhase = document.getElementById('loadPhase');
  const loadLabel = document.getElementById('loadLabel');
  const loadBarFill = document.getElementById('loadBarFill');
  const loadPct = document.getElementById('loadPct');

  const sceneVideo = document.getElementById('sceneVideo');
  const sceneTitleTop = document.getElementById('sceneTitleTop');
  const sceneTitleBottom = document.getElementById('sceneTitleBottom');
  const scenePhase = document.getElementById('scenePhase');
  const captionCard = document.getElementById('captionCard');
  const typedText = document.getElementById('typedText');
  const nextBtn = document.getElementById('nextBtn');
  const nextLabel = document.getElementById('nextLabel');
  const nextArrow = document.getElementById('nextArrow');
  const glitchVeil = document.getElementById('glitchVeil');

  const sectionAudio = document.getElementById('sectionAudio');
  const notesHandle = document.getElementById('notesHandle');
  const notesTitle = document.getElementById('notesTitle');
  const notesTag = document.getElementById('notesTag');
  const notesBody = document.getElementById('notesBody');

  // --- Sound ------------------------------------------------------------------
  // One track per section: the home card gets 0.mp3, and each room's track
  // starts with its loading clip and carries through the glitch into the room.
  // The clips keep their own sound underneath at VIDEO_VOLUME.
  const soundToggle = document.getElementById('soundToggle');
  let soundOn = true;
  let gestureArmed = false;

  function armGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    const resume = () => {
      gestureArmed = false;
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
      playAudio();
      [loadVideo, sceneVideo].forEach((v) => {
        if (v.src && v.closest('.screen').classList.contains('is-active')) v.play().catch(() => {});
      });
    };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);
  }

  function playAudio() {
    if (!soundOn || !sectionAudio.getAttribute('src')) return;
    // Browsers block audible playback until the visitor has interacted.
    sectionAudio.play().catch(armGesture);
  }

  function setSectionAudio(src) {
    if (sectionAudio.getAttribute('src') === src) return;
    sectionAudio.setAttribute('src', src);
    sectionAudio.load();
    playAudio();
  }

  function applySound() {
    sectionAudio.muted = !soundOn;
    [loadVideo, sceneVideo].forEach((v) => {
      v.muted = !soundOn;
      v.volume = VIDEO_VOLUME;
    });
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    soundToggle.querySelector('.label').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
  }

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    applySound();
    if (soundOn) playAudio();
    else sectionAudio.pause();
  });

  applySound();

  // --- Run state -------------------------------------------------------------
  let index = -1;            // index into CHAPTERS; -1 === home screen
  let busy = false;          // true while loading/glitching, blocks double-clicks
  let typing = false;
  let typeTimeout = null;
  let loadRaf = null;
  let glitchTimeouts = [];

  function clearPending() {
    if (typeTimeout) { clearTimeout(typeTimeout); typeTimeout = null; }
    if (loadRaf) { cancelAnimationFrame(loadRaf); loadRaf = null; }
    glitchTimeouts.forEach(clearTimeout);
    glitchTimeouts = [];
  }

  function showScreen(el) {
    [screenHome, screenLoad, screenScene].forEach((s) => {
      const active = s === el;
      s.classList.toggle('is-active', active);
      s.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
  }

  // --- Fluorescent-tube letter flicker ---------------------------------------
  function buildFlicker(el, text) {
    el.dataset.flicker = text;
    el.innerHTML = '';
    text.split('').forEach((ch) => {
      const span = document.createElement('span');
      span.className = 'letter';
      span.textContent = ch === ' ' ? ' ' : ch;
      span.style.animationDelay = (Math.random() * 6).toFixed(2) + 's';
      span.style.animationDuration = (5 + Math.random() * 3).toFixed(2) + 's';
      el.appendChild(span);
    });
  }

  document.querySelectorAll('[data-flicker]').forEach((el) => buildFlicker(el, el.dataset.flicker));

  setInterval(() => {
    const els = Array.from(document.querySelectorAll('.reel-title-bottom'))
      .filter((el) => el.offsetParent !== null && el.querySelector('.letter'));
    if (!els.length) return;
    const letters = els[Math.floor(Math.random() * els.length)].querySelectorAll('.letter');
    const hits = new Set();
    const count = 1 + Math.floor(Math.random() * 2);
    for (let n = 0; n < count; n++) hits.add(Math.floor(Math.random() * letters.length));
    hits.forEach((i) => {
      const span = letters[i];
      span.classList.add('burst');
      setTimeout(() => span.classList.remove('burst'), 500);
    });
  }, 5000);

  // --- Log panel -------------------------------------------------------------
  function setLog(chapter) {
    if (!chapter) {
      notesTitle.textContent = 'Log entry';
      notesTag.textContent = '--:--';
      notesBody.textContent = 'No entries recorded. The walk has not started yet.';
      return;
    }
    notesTitle.textContent = 'Log entry — ' + chapter.room;
    notesTag.textContent = chapter.stamp;
    notesBody.textContent = chapter.log;
  }

  notesHandle.addEventListener('click', () => body.classList.toggle('notes-open'));
  setLog(null);
  setSectionAudio(HOME_AUDIO);

  // --- Typewriter ------------------------------------------------------------
  function finishTyping(chapter) {
    typing = false;
    if (typeTimeout) { clearTimeout(typeTimeout); typeTimeout = null; }
    typedText.textContent = chapter.caption;
    revealNext();
  }

  function typeCaption(chapter) {
    typedText.textContent = '';
    typing = true;

    if (reducedMotion) {
      typeTimeout = setTimeout(() => finishTyping(chapter), TYPE_START_DELAY_MS);
      return;
    }

    const full = chapter.caption;
    let i = 0;

    function step() {
      if (!typing) return;
      if (i > full.length) { finishTyping(chapter); return; }
      typedText.textContent = full.slice(0, i);
      const justTyped = full[i - 1];
      let delay = 30 + Math.random() * 18;
      if (justTyped === '.' || justTyped === '?') delay += 480 + Math.random() * 220;
      else if (justTyped === ',') delay += 200 + Math.random() * 120;
      else if (Math.random() < 0.06) delay += 130;
      i++;
      typeTimeout = setTimeout(step, delay);
    }

    typeTimeout = setTimeout(step, TYPE_START_DELAY_MS);
  }

  // Clicking the card skips ahead to the end of the caption.
  captionCard.addEventListener('click', () => {
    if (typing) finishTyping(CHAPTERS[index]);
  });

  function revealNext() {
    const last = index === CHAPTERS.length - 1;
    nextLabel.textContent = last ? 'BEGIN AGAIN' : 'NEXT';
    nextArrow.innerHTML = last ? '&#8635;' : '&rarr;';
    nextBtn.hidden = false;
    requestAnimationFrame(() => nextBtn.classList.add('visible'));
  }

  function hideNext() {
    nextBtn.classList.remove('visible');
    nextBtn.hidden = true;
  }

  // --- Glitch transition -----------------------------------------------------
  function glitchTo(fn) {
    if (reducedMotion) {
      stage.classList.add('fading');
      glitchTimeouts.push(setTimeout(() => {
        fn();
        stage.classList.remove('fading');
      }, 260));
      return;
    }
    stage.classList.add('glitching');
    glitchVeil.classList.add('firing');
    glitchTimeouts.push(setTimeout(fn, GLITCH_SWAP_MS));
    glitchTimeouts.push(setTimeout(() => {
      stage.classList.remove('glitching');
      glitchVeil.classList.remove('firing');
    }, GLITCH_MS));
  }

  // --- Loading screen --------------------------------------------------------
  function runLoader(chapter, done) {
    loadPhase.textContent = chapter.phase.toUpperCase();
    loadLabel.textContent = 'LOADING ROOM ' + chapter.id;
    loadPct.textContent = '00%';
    loadBarFill.style.width = '0%';

    setSectionAudio(chapter.audio);

    loadVideo.src = chapter.load;
    loadVideo.load();
    loadVideo.muted = !soundOn;
    loadVideo.volume = VIDEO_VOLUME;
    loadVideo.play().catch(armGesture);

    // The room video buffers behind the loading clip for the full four seconds.
    sceneVideo.src = chapter.video;
    sceneVideo.load();

    showScreen(screenLoad);

    const started = performance.now();
    function tick(now) {
      const elapsed = now - started;
      const linear = Math.min(1, elapsed / LOAD_MS);
      // Stutter the readout so it never climbs cleanly to 100.
      const jitter = linear < 1 ? (Math.random() - 0.5) * 0.04 : 0;
      const shown = Math.max(0, Math.min(1, linear + jitter));
      loadBarFill.style.width = (linear * 100).toFixed(1) + '%';
      loadPct.textContent = String(Math.round(shown * 100)).padStart(2, '0') + '%';
      if (linear < 1) {
        loadRaf = requestAnimationFrame(tick);
      } else {
        loadRaf = null;
        loadPct.textContent = '100%';
        done();
      }
    }
    loadRaf = requestAnimationFrame(tick);
  }

  // --- Chapter screen --------------------------------------------------------
  function enterChapter(i) {
    index = i;
    const chapter = CHAPTERS[i];

    body.className = 'chapter-' + chapter.id.toLowerCase() +
      (body.classList.contains('notes-open') ? ' notes-open' : '');

    captionCard.style.setProperty('--rot', chapter.rot);
    sceneTitleTop.textContent = chapter.room;
    buildFlicker(sceneTitleBottom, chapter.epithet);
    scenePhase.textContent = chapter.phase.split('—')[0].trim().toUpperCase();

    setLog(chapter);
    hideNext();
    typedText.textContent = '';

    if (sceneVideo.src.indexOf(chapter.video) === -1) sceneVideo.src = chapter.video;
    // Safari throws if currentTime is set before any metadata has arrived.
    if (sceneVideo.readyState > 0) sceneVideo.currentTime = 0;
    sceneVideo.muted = !soundOn;
    sceneVideo.volume = VIDEO_VOLUME;
    sceneVideo.play().catch(armGesture);

    showScreen(screenScene);
    loadVideo.pause();

    requestAnimationFrame(() => captionCard.classList.add('visible'));
    typeCaption(chapter);
    busy = false;

    // Warm up the next loading clip while this room is being read.
    const next = CHAPTERS[i + 1];
    if (next) {
      const warm = document.createElement('video');
      warm.preload = 'auto';
      warm.muted = true;
      warm.src = next.load;
    }
  }

  // --- Navigation ------------------------------------------------------------
  function goToChapter(i) {
    if (busy) return;
    busy = true;
    clearPending();
    typing = false;
    hideNext();
    captionCard.classList.remove('visible');

    runLoader(CHAPTERS[i], () => {
      glitchTo(() => enterChapter(i));
    });
  }

  function goHome() {
    if (busy) return;
    busy = true;
    clearPending();
    typing = false;
    hideNext();
    captionCard.classList.remove('visible');

    glitchTo(() => {
      index = -1;
      body.className = 'phase-home' + (body.classList.contains('notes-open') ? ' notes-open' : '');
      sceneVideo.pause();
      loadVideo.pause();
      setLog(null);
      body.classList.remove('notes-open');
      setSectionAudio(HOME_AUDIO);
      showScreen(screenHome);
      busy = false;
    });
  }

  startBtn.addEventListener('click', () => goToChapter(0));

  nextBtn.addEventListener('click', () => {
    if (busy) return;
    if (index === CHAPTERS.length - 1) goHome();
    else goToChapter(index + 1);
  });

  // Enter / Space advances too, without stealing the keys from a focused button.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    if (busy) return;
    if (index === -1) { e.preventDefault(); startBtn.click(); }
    else if (typing) { e.preventDefault(); finishTyping(CHAPTERS[index]); }
    else if (!nextBtn.hidden) { e.preventDefault(); nextBtn.click(); }
  });

  window.addEventListener('beforeunload', () => { try { sectionAudio.pause(); } catch (_) {} });
})();
