(function () {
  const TYPE_START_DELAY_MS = 400;
  const HOLD_MS = 20000;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sections = Array.from(document.querySelectorAll('section.reel'));
  const state = new WeakMap();

  const notes = {
    r1: { tag: 'FN-01', title: 'THE WRONG DOOR', body: "The word comes from the Latin limen, \u201cthreshold.\u201d Anthropologists first used it for the middle stage of a rite of passage \u2014 the moment between what a person was and what they haven't become yet." },
    r2: { tag: 'FN-02', title: 'NON-PLACE', body: 'Anthropologist Marc Aug\u00e9 coined \u201cnon-place\u201d for spaces built only to be passed through: airports, motorway stops, hotel corridors. He argued no one is ever truly present in them, including the people who run them.' },
    r3: { tag: 'FN-03', title: 'THE HUM', body: 'Liminal-space photography became a genre online around 2019, built from ordinary interiors \u2014 empty malls, waiting rooms, motel hallways. The unease is structural, not supernatural: a space with no one in it reads as wrong.' },
    r4: { tag: 'FN-04', title: 'ETERNAL RECURRENCE', body: 'Victor Turner extended the concept in the 1960s, describing liminality as a state rather than a stage \u2014 a condition some people, and some places, get stuck in, never completing the passage through.' },
    r5: { tag: 'FN-05', title: 'NO EXIT', body: 'The \u201cBackrooms\u201d myth began with a single uncredited photo in 2019: a yellow, fluorescent-lit room with no visible exit. It spread because the image needed no story attached to unsettle people.' },
    r6: { tag: 'FN-06', title: 'THE ONE WHO WAS JUST HERE', body: 'Liminal spaces unsettle partly because they show clear evidence of use \u2014 a chair, a cup, a coat \u2014 with no one present. The absence reads louder than the object does.' },
    r7: { tag: 'FN-07', title: 'UNCANNY VALLEY OF SPACE', body: 'Freud\u2019s \u201cuncanny\u201d describes something almost familiar. Liminal architecture applies the same effect to rooms: recognizable enough to expect normal use, wrong enough that the eye can\u2019t finish the match.' }
  };

  const notesTitleEl = document.getElementById('notesTitle');
  const notesTagEl = document.getElementById('notesTag');
  const notesBodyEl = document.getElementById('notesBody');

  function setActiveNote(id) {
    const n = notes[id];
    if (!n) return;
    notesTitleEl.textContent = 'Field notes — ' + n.title;
    notesTagEl.textContent = n.tag;
    notesBodyEl.textContent = n.body;
  }

  sections.forEach((section) => {
    state.set(section, {
      typeTimeout: null,
      holdTimeout: null,
      active: false
    });
  });

  function clearTimers(section) {
    const s = state.get(section);
    if (s.typeTimeout) { clearTimeout(s.typeTimeout); s.typeTimeout = null; }
    if (s.holdTimeout) { clearTimeout(s.holdTimeout); s.holdTimeout = null; }
  }

  function resetSection(section) {
    const s = state.get(section);
    clearTimers(section);
    s.active = false;
    const card = section.querySelector('.center-card');
    const typedEl = section.querySelector('.typed-text');
    card.classList.remove('visible');
    typedEl.textContent = '';
  }

  function startSection(section) {
    const s = state.get(section);
    if (s.active) return;
    s.active = true;
    clearTimers(section);

    const card = section.querySelector('.center-card');
    const typedEl = section.querySelector('.typed-text');
    const fullText = section.dataset.text || '';
    typedEl.textContent = '';

    requestAnimationFrame(() => {
      card.classList.add('visible');
    });

    if (reducedMotion) {
      typedEl.textContent = fullText;
      return;
    }

    let i = 0;
    function typeChar() {
      if (!s.active) return;
      if (i <= fullText.length) {
        typedEl.textContent = fullText.slice(0, i);
        const justTyped = fullText[i - 1];
        let delay = 34 + Math.random() * 20;
        if (justTyped === '.' || justTyped === ',') delay += 550 + Math.random() * 250;
        else if (Math.random() < 0.07) delay += 140;
        i++;
        s.typeTimeout = setTimeout(typeChar, delay);
      } else {
        s.holdTimeout = setTimeout(() => {
          card.classList.remove('visible');
        }, HOLD_MS);
      }
    }

    s.typeTimeout = setTimeout(typeChar, TYPE_START_DELAY_MS);
  }

  const visibleVideos = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target.querySelector('video');
      if (video) {
        if (entry.isIntersecting) {
          visibleVideos.add(video);
          video.play().catch(() => {});
        } else {
          visibleVideos.delete(video);
          video.pause();
        }
      }

      if (entry.isIntersecting && entry.intersectionRatio >= 0.95) {
        startSection(entry.target);
        setActiveNote(entry.target.dataset.note);
      } else {
        resetSection(entry.target);
      }
    });
  }, { threshold: [0, 0.95, 1] });

  sections.forEach((section) => observer.observe(section));

  // --- Letter flicker on titleBottom (fluorescent-tube effect) ---
  const flickerEls = Array.from(document.querySelectorAll('.reel-title-bottom'));
  flickerEls.forEach((el) => {
    const text = el.dataset.flicker || '';
    el.innerHTML = '';
    text.split('').forEach((ch) => {
      const span = document.createElement('span');
      span.className = 'letter';
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      span.style.animationDelay = (Math.random() * 6).toFixed(2) + 's';
      span.style.animationDuration = (5 + Math.random() * 3).toFixed(2) + 's';
      el.appendChild(span);
    });
  });

  setInterval(() => {
    if (reducedMotion || !flickerEls.length) return;
    const el = flickerEls[Math.floor(Math.random() * flickerEls.length)];
    const letters = el.querySelectorAll('.letter');
    if (!letters.length) return;
    const count = 1 + Math.floor(Math.random() * 2);
    const hitIdx = new Set();
    for (let n = 0; n < count; n++) hitIdx.add(Math.floor(Math.random() * letters.length));
    hitIdx.forEach((idx) => {
      const span = letters[idx];
      span.classList.add('burst');
      setTimeout(() => span.classList.remove('burst'), 500);
    });
  }, 5000);

  // --- Scroll parallax on background video + header ---
  let raf = null;
  function onScrollParallax() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      const vh = window.innerHeight;
      sections.forEach((sec) => {
        const rect = sec.getBoundingClientRect();
        const centerOffset = rect.top / vh;
        const progress = Math.max(-1, Math.min(1, centerOffset));
        const video = sec.querySelector('video');
        const head = sec.querySelector('.reel-header');
        if (video) video.style.transform = `scale(${1.05 + Math.abs(progress) * 0.1}) translateY(${progress * 30}px)`;
        if (head) {
          head.style.transform = `translateY(${progress * 40}px)`;
          head.style.opacity = String(1 - Math.abs(progress) * 0.5);
        }
      });
    });
  }
  if (!reducedMotion) {
    window.addEventListener('scroll', onScrollParallax, { passive: true });
    onScrollParallax();
  }

  // --- Field notes tab toggle ---
  const notesHandle = document.getElementById('notesHandle');
  notesHandle.addEventListener('click', () => {
    document.body.classList.toggle('notes-open');
  });
  setActiveNote('r1');

  // --- Ambient audio, decoupled from per-section (always-muted) videos ---
  const soundToggle = document.getElementById('soundToggle');
  const ambientAudio = document.getElementById('ambientAudio');
  let soundOn = false;

  function setSound(on) {
    soundOn = on;
    if (on) {
      ambientAudio.play().catch(() => {});
    } else {
      ambientAudio.pause();
    }
    soundToggle.setAttribute('aria-pressed', String(on));
    soundToggle.querySelector('.label').textContent = on ? 'SOUND ON' : 'SOUND OFF';
  }

  soundToggle.addEventListener('click', () => setSound(!soundOn));

  // Autoplay can still be gated behind a first gesture on some browsers even muted.
  document.addEventListener(
    'click',
    (e) => {
      if (e.target === soundToggle || soundToggle.contains(e.target)) return;
      visibleVideos.forEach((v) => v.play().catch(() => {}));
    },
    { once: true }
  );

  window.addEventListener('beforeunload', () => { try { ambientAudio.pause(); } catch (_) {} });
})();
