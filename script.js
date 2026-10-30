(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Chapters. Each room's scene file (walk/scenes/<id>.js) holds its chapter
  // in meta.chapter, next to its objective: the loading clip (lowercase file),
  // the room video it glitches into (uppercase file), its track, caption, stamp
  // and log entry. walk.js chapters() returns them in the order the rooms are
  // registered there, each with `walk` naming its scene. They are loaded once,
  // at startup (see chaptersReady); START waits for them.
  // ---------------------------------------------------------------------------
  let CHAPTERS = [];

  const HOME_AUDIO = '0.mp3';  // plays on the title card
  // A loading screen shows exactly LOAD_SECONDS of its clip, counted in playback
  // time rather than wall-clock: the count starts when the video actually starts,
  // and buffering pauses it, so a slow clip is never cut short of its five
  // seconds. The guards below only catch a clip that never plays at all.
  const LOAD_SECONDS = 5.0;
  const LOAD_STALL_MS = 6000;   // no PICTURE MOVEMENT for this long means it is stuck
  const LOAD_START_MS = 6000;   // never got going at all
  const LOAD_CAP_MS = 15000;    // last-resort ceiling so the walk can never hang
  const GLITCH_MS = 900;       // total glitch length
  const GLITCH_SWAP_MS = 320;  // when, inside the glitch, the screens swap
  const TYPE_START_DELAY_MS = 700;
  const CAPTION_HOLD_MS = 5000;  // the card clears this long after it finishes typing

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Elements --------------------------------------------------------------
  const body = document.body;
  const stage = document.getElementById('stage');
  const screenHome = document.getElementById('screenHome');
  const screenLoad = document.getElementById('screenLoad');
  const screenScene = document.getElementById('screenScene');
  const screenWalk = document.getElementById('screenWalk');

  const startBtn = document.getElementById('startBtn');
  const loadVideo = document.getElementById('loadVideo');

  const sceneVideo = document.getElementById('sceneVideo');
  const sceneTitleTop = document.getElementById('sceneTitleTop');
  const sceneTitleBottom = document.getElementById('sceneTitleBottom');
  const captionCard = document.getElementById('captionCard');
  const typedText = document.getElementById('typedText');
  const nextBtn = document.getElementById('nextBtn');
  const nextLabel = document.getElementById('nextLabel');
  const nextArrow = document.getElementById('nextArrow');
  const glitchVeil = document.getElementById('glitchVeil');
  const WALK_ELEMENTS = {
    mount: document.getElementById('walkMount'),
    objective: document.getElementById('walkObjective'),
    hint: document.getElementById('walkHint'),
    joystick: document.getElementById('walkJoystick'),
    readout: document.getElementById('walkReadout'),
    tally: document.getElementById('walkTally'),
    use: document.getElementById('walkUse'),
    fade: document.getElementById('walkFade'),
  };

  const sectionAudio = document.getElementById('sectionAudio');
  const notesHandle = document.getElementById('notesHandle');
  const notesTitle = document.getElementById('notesTitle');
  const notesTag = document.getElementById('notesTag');
  const notesBody = document.getElementById('notesBody');

  // --- Sound ------------------------------------------------------------------
  // One track per section: the home card gets 0.mp3, and each room's track
  // starts with its loading clip and carries through the glitch into the room.
  // The clips themselves are muted, so the track is the only thing that needs
  // a gesture before it is allowed to start.
  const soundToggle = document.getElementById('soundToggle');
  let soundOn = true;
  let walkModule = null;   // the 3D walk module, loaded on demand (see loadWalk)
  let gestureArmed = false;

  function armGesture() {
    if (gestureArmed) return;
    gestureArmed = true;
    const resume = () => {
      gestureArmed = false;
      document.removeEventListener('pointerdown', resume);
      document.removeEventListener('keydown', resume);
      playAudio();
    };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);
  }

  function playAudio() {
    if (!soundOn || !sectionAudio.getAttribute('src')) return;
    // Browsers block audible playback until the visitor has interacted.
    sectionAudio.play().catch(armGesture);
  }

  // Starting an unmuted <video> hands it the audio session on mobile, which
  // pauses the section track mid-room. The track is meant to run over both the
  // loading clip and the room, so take it back whenever something else stops it.
  let reclaims = 0;
  sectionAudio.addEventListener('playing', () => { reclaims = 0; });
  sectionAudio.addEventListener('pause', () => {
    if (!soundOn || sectionAudio.ended || reclaims >= 8) return;
    reclaims++;
    setTimeout(() => {
      if (soundOn && sectionAudio.paused) sectionAudio.play().catch(() => {});
    }, 80);
  });

  function setSectionAudio(src) {
    if (sectionAudio.getAttribute('src') === src) return;
    sectionAudio.setAttribute('src', src);
    sectionAudio.load();
    playAudio();
  }

  function applySound() {
    // The clips are always silent — the section track is the only sound here.
    sectionAudio.muted = !soundOn;
    if (walkModule) walkModule.then((mod) => mod && mod.setSound(soundOn));
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    soundToggle.querySelector('.label').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
  }

  const gate = document.getElementById('gate');
  let gateUp = true;

  function openGate(e) {
    if (!gateUp) return;
    gateUp = false;
    // This listener is registered before the navigation one, so a keypress that
    // opens the gate must not also fall through and press START.
    if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
    document.removeEventListener('keydown', openGate);
    gate.classList.add('gone');
    gate.addEventListener('transitionend', () => gate.remove(), { once: true });
    setTimeout(() => { if (gate.isConnected) gate.remove(); }, 900);
    playAudio();
  }

  const skipBtn = document.getElementById('skipBtn');
  skipBtn.addEventListener('click', () => { if (skipLoader) skipLoader(); });

  gate.addEventListener('click', openGate);
  document.addEventListener('keydown', openGate);

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
  let holdTimeout = null;
  let cancelLoader = null;   // tears down the in-flight loading screen
  let skipLoader = null;     // ends it early and moves on to the room
  let glitchTimeouts = [];
  let warmClip = null;       // held so the prefetch is not garbage collected

  function clearPending() {
    if (typeTimeout) { clearTimeout(typeTimeout); typeTimeout = null; }
    if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
    if (cancelLoader) { cancelLoader(); cancelLoader = null; }
    glitchTimeouts.forEach(clearTimeout);
    glitchTimeouts = [];
  }

  function showScreen(el) {
    [screenHome, screenLoad, screenScene, screenWalk].forEach((s) => {
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
    // The card has been read by now; let the room stand on its own.
    if (holdTimeout) clearTimeout(holdTimeout);
    holdTimeout = setTimeout(() => {
      captionCard.classList.remove('visible');
      holdTimeout = null;
    }, CAPTION_HOLD_MS);
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
    setSectionAudio(chapter.audio);
    body.className = 'phase-load' + (body.classList.contains('notes-open') ? ' notes-open' : '');

    let finished = false;
    let stallTimer = null;
    let capTimer = null;
    let cutTimer = null;
    let roomQueued = false;
    let lastTime = 0;

    function teardown() {
      loadVideo.removeEventListener('ended', finish);
      loadVideo.removeEventListener('timeupdate', onProgress);
      loadVideo.removeEventListener('playing', onPlaying);
      loadVideo.removeEventListener('waiting', onWaiting);
      loadVideo.removeEventListener('error', finish);
      [stallTimer, capTimer, cutTimer].forEach((t) => t && clearTimeout(t));
      stallTimer = capTimer = cutTimer = null;
      cancelLoader = null;
      skipLoader = null;
    }

    function finish() {
      if (finished) return;
      finished = true;
      teardown();
      done();
    }

    // Guards only: any sign of progress buys the clip another window, so a clip
    // that buffers is never mistaken for one that is stuck.
    function armStall() {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(finish, LOAD_STALL_MS);
    }

    // A timeupdate is not proof of progress: a stalled clip can keep firing them
    // with currentTime frozen. Only an actual advance counts, otherwise the
    // guard re-arms forever and the loading screen hangs.
    function progressed() {
      const t = loadVideo.currentTime;
      if (t > lastTime + 0.01) { lastTime = t; return true; }
      return false;
    }

    // The cut is scheduled from where playback actually is, so it lands on
    // LOAD_SECONDS of video however long the clip took to get there.
    function armCut() {
      if (cutTimer) clearTimeout(cutTimer);
      const remaining = (LOAD_SECONDS - loadVideo.currentTime) * 1000;
      cutTimer = setTimeout(finish, Math.max(0, remaining));
    }

    function onProgress() {
      if (!progressed()) return;          // frozen picture: let the guard run out
      armStall();
      if (loadVideo.currentTime >= LOAD_SECONDS) { finish(); return; }
      // Re-aim the cut from where playback actually is, so it converges on
      // LOAD_SECONDS instead of drifting with however the clip decodes. If a
      // stall cleared it, put it back now that the picture is moving again.
      armCut();
    }

    function onWaiting() {
      // Buffering: hold the count until the picture moves again.
      if (cutTimer) { clearTimeout(cutTimer); cutTimer = null; }
    }

    function onPlaying() {
      armStall();
      armCut();
      // Only start pulling the room video once the loading clip is actually
      // running, so the two are not competing for the connection while the
      // loading screen is what is on screen.
      if (roomQueued) return;
      roomQueued = true;
      sceneVideo.src = chapter.video;
      sceneVideo.load();
    }

    loadVideo.loop = false;
    loadVideo.muted = true;          // the section track is the only sound
    loadVideo.src = chapter.load;
    loadVideo.load();

    loadVideo.addEventListener('ended', finish);
    loadVideo.addEventListener('timeupdate', onProgress);
    loadVideo.addEventListener('playing', onPlaying);
    loadVideo.addEventListener('waiting', onWaiting);
    loadVideo.addEventListener('error', finish);

    // Two separate ceilings: one for a clip that never starts, one absolute.
    stallTimer = setTimeout(finish, LOAD_START_MS);
    capTimer = setTimeout(finish, LOAD_CAP_MS);
    cancelLoader = () => { finished = true; teardown(); };
    skipLoader = finish;

    showScreen(screenLoad);
    loadVideo.play().catch(() => {});
  }

  // --- Walk phase (3D) ---------------------------------------------------------
  // The walk module (three.js and the rooms) is only fetched once a chapter that
  // has a scene is on screen, and the room is built while its video plays, so
  // pressing NEXT drops straight into it. Any failure (no WebGL, a blocked
  // fetch) falls back to the plain loading screen.
  function loadWalk() {
    if (!walkModule) {
      walkModule = import('./walk/walk.js').catch((err) => {
        console.warn('walk phase unavailable:', err);
        walkModule = null;
        return null;
      });
    }
    return walkModule;
  }

  function prepareWalk(chapter) {
    if (!chapter.walk) return;
    loadWalk().then((mod) => mod && mod.hasScene(chapter.walk) && mod.prepare(chapter.walk, WALK_ELEMENTS))
      .catch((err) => console.warn('walk scene failed to build:', err));
  }

  function runLoaderThen(i) {
    runLoader(CHAPTERS[i], () => {
      glitchTo(() => enterChapter(i));
    });
  }

  function goToWalk(i) {
    if (busy) return;
    const chapter = CHAPTERS[i];
    busy = true;
    clearPending();
    typing = false;
    hideNext();
    captionCard.classList.remove('visible');

    loadWalk().then((mod) => {
      if (!mod || !mod.hasScene(chapter.walk)) { runLoaderThen(i + 1); return; }
      glitchTo(() => {
        body.className = 'phase-walk';   // the log panel closes: the room needs the whole screen
        showScreen(screenWalk);
        sceneVideo.pause();
        skipLoader = () => mod.skip();
        cancelLoader = () => mod.cancel();
        mod.start(chapter.walk, WALK_ELEMENTS, { reducedMotion, sound: soundOn }).then((result) => {
          skipLoader = null;
          cancelLoader = null;
          if (result === 'cancelled') return;
          // The last room's exit closes the loop: back to the title card.
          if (i === CHAPTERS.length - 1) { busy = false; goHome(); return; }
          runLoaderThen(i + 1);
        }).catch((err) => {
          console.warn('walk failed, skipping to the loading screen:', err);
          skipLoader = null;
          cancelLoader = null;
          if (i === CHAPTERS.length - 1) { busy = false; goHome(); return; }
          runLoaderThen(i + 1);
        });
      });
    });
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

    setLog(chapter);
    hideNext();
    typedText.textContent = '';

    if (sceneVideo.src.indexOf(chapter.video) === -1) sceneVideo.src = chapter.video;
    sceneVideo.muted = true;         // the section track is the only sound
    // Safari throws if currentTime is set before any metadata has arrived.
    if (sceneVideo.readyState > 0) sceneVideo.currentTime = 0;
    sceneVideo.play().catch(() => {});

    showScreen(screenScene);
    loadVideo.pause();

    // The room video has just grabbed for the audio session; take it back.
    playAudio();

    requestAnimationFrame(() => captionCard.classList.add('visible'));
    typeCaption(chapter);
    busy = false;

    // Warm up the next loading clip while this room is being read.
    const next = CHAPTERS[i + 1];
    if (next) {
      warmClip = document.createElement('video');
      warmClip.preload = 'auto';
      warmClip.muted = true;
      warmClip.src = next.load;
    }

    // And build this room's walk scene once the video has had a moment to start.
    if (chapter.walk) setTimeout(() => { if (index === i) prepareWalk(chapter); }, 1500);
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

  // The chapters live in the rooms' scene files, so they come in with the walk module. It
  // starts loading now, while the title card is up; START waits for it. Without it (a
  // browser that cannot load modules) there is nothing to play, and START says so.
  const chaptersReady = loadWalk().then((mod) => {
    if (!mod) throw new Error('walk module unavailable');
    return mod.chapters();
  }).then((list) => { CHAPTERS = list; return list; });
  chaptersReady.catch((err) => {
    console.warn('chapters unavailable:', err);
    startBtn.disabled = true;
    startBtn.querySelector('.start-btn-label').textContent = 'THIS BROWSER CANNOT OPEN THE ROOMS';
  });

  // ?chapter=C makes START open on that room (used by tools/walk_test.mjs and for look-dev).
  const jumpId = String(new URLSearchParams(window.location.search).get('chapter') || '').toUpperCase();
  startBtn.addEventListener('click', () => {
    chaptersReady.then(() => {
      const jumpTo = CHAPTERS.findIndex((c) => c.id === jumpId);
      goToChapter(jumpTo >= 0 ? jumpTo : 0);
    }, () => {});
  });

  nextBtn.addEventListener('click', () => {
    if (busy) return;
    if (CHAPTERS[index].walk) goToWalk(index);
    else if (index === CHAPTERS.length - 1) goHome();
    else goToChapter(index + 1);
  });

  // Enter / Space advances too, without stealing the keys from a focused button.
  document.addEventListener('keydown', (e) => {
    if (gateUp) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    if (busy) return;
    if (index === -1) { e.preventDefault(); startBtn.click(); }
    else if (typing) { e.preventDefault(); finishTyping(CHAPTERS[index]); }
    else if (!nextBtn.hidden) { e.preventDefault(); nextBtn.click(); }
  });

  window.addEventListener('beforeunload', () => { try { sectionAudio.pause(); } catch (_) {} });
})();
