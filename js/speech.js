// ── Speech Recognition ──────────────────────────────────────────────────────

let recognition = null;
let isListening = false;
let manualStop = true;
let sessionBaseText = '';
let committedText = '';
let lastFinalFragment = '';
let recentFinals = [];

// Elements — set by init
let _micBtn, _micLabel, _micSub, _liveText, _transcriptBox, _langSelect;

export function initSpeech({ micBtn, micLabel, micSub, liveText, transcriptBox, langSelect }) {
  _micBtn = micBtn;
  _micLabel = micLabel;
  _micSub = micSub;
  _liveText = liveText;
  _transcriptBox = transcriptBox;
  _langSelect = langSelect;
  checkSpeechSupport();
}

function checkSpeechSupport() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (_micBtn) { _micBtn.disabled = true; }
    if (_micLabel) _micLabel.textContent = 'Mic not supported on this browser';
    if (_micSub) _micSub.textContent = "iPhone Safari doesn't support speech-to-text yet — type your note in the box below instead.";
  }
}

function getRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  return r;
}

let micPermissionGranted = false;

export async function ensureMicPermission() {
  if (micPermissionGranted) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (_micSub) _micSub.textContent = 'This viewer is blocking microphone access. Open with Chrome, then try again.';
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    micPermissionGranted = true;
    return true;
  } catch (err) {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const ua = navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    const site = window.location.origin + window.location.pathname;

    let deniedMsg;
    if (standalone && iosDevice) {
      deniedMsg = `Mic permission denied. Open Safari, go to ${site}, tap "aA" → Website Settings → Microphone → Allow. Then reopen the app.`;
    } else if (standalone) {
      deniedMsg = `Mic permission denied. Open Chrome, go to ${site}, tap 🔒 → Permissions → Microphone → Allow. Then reopen the app.`;
    } else {
      deniedMsg = 'Mic permission denied. Tap 🔒 next to address bar → Permissions → Microphone → Allow, then try again.';
    }

    const map = {
      NotAllowedError: deniedMsg,
      PermissionDeniedError: deniedMsg,
      NotFoundError: 'No microphone found on this device.',
      NotReadableError: 'Microphone is being used by another app. Close it and try again.',
      SecurityError: 'This viewer is blocking microphone access. Open with Chrome, then try again.',
      AbortError: 'Microphone access was interrupted. Try again.'
    };
    if (_micSub) _micSub.textContent = map[err.name] || ('Mic error: ' + err.name + '. Try opening with the Chrome browser app.');
    return false;
  }
}

function normalizeForDup(s) { return s.toLowerCase().replace(/\s+/g, ' ').trim(); }

function attachRecognitionHandlers() {
  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) { final += transcript; }
      else { interim += transcript; }
    }
    if (final.trim()) {
      const trimmedFinal = final.trim();
      const norm = normalizeForDup(trimmedFinal);
      const isDup = recentFinals.some(prev =>
        prev === norm || prev.endsWith(norm) || norm.startsWith(prev)
      );
      if (!isDup) {
        committedText = committedText ? (committedText + ' ' + trimmedFinal) : trimmedFinal;
        lastFinalFragment = trimmedFinal;
        recentFinals.push(norm);
        if (recentFinals.length > 4) recentFinals.shift();
      }
    }
    const confirmed = [sessionBaseText, committedText].filter(Boolean).join(' ');
    if (_transcriptBox) {
      _transcriptBox.value = interim ? (confirmed ? confirmed + ' ' + interim : interim) : confirmed;
    }
  };

  recognition.onerror = (e) => {
    const fatal = ['not-allowed', 'permission-denied', 'audio-capture', 'service-not-allowed'];
    const messages = {
      'not-allowed': 'Mic permission denied. Allow microphone access in browser settings and try again.',
      'permission-denied': 'Mic permission denied. Allow microphone access in browser settings and try again.',
      'audio-capture': 'No microphone found on this device.',
      'network': 'Network error during speech recognition. Check your internet connection.',
      'service-not-allowed': 'Speech service blocked. Try again in a moment.'
    };
    if (fatal.includes(e.error)) {
      manualStop = true;
      if (_micSub) _micSub.textContent = messages[e.error] || ('Mic error: ' + e.error);
    } else if (e.error === 'no-speech') {
      // silence — keep mic open, onend will restart
    } else if (e.error !== 'aborted') {
      if (_micSub) _micSub.textContent = messages[e.error] || ('Mic error: ' + e.error + '. Still listening...');
    }
  };

  recognition.onend = () => {
    if (manualStop) { stopListening(); return; }
    setTimeout(() => {
      if (manualStop) return;
      try {
        recognition.start();
      } catch (e) {
        try {
          recognition = getRecognition();
          recognition.lang = _langSelect ? _langSelect.value : 'te-IN';
          attachRecognitionHandlers();
          recognition.start();
        } catch (e2) { stopListening(); }
      }
    }, 300);
  };
}

export async function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const granted = await ensureMicPermission();
  if (!granted) return;

  sessionBaseText = _transcriptBox ? _transcriptBox.value.trim() : '';
  committedText = '';
  lastFinalFragment = '';
  recentFinals = [];

  recognition = getRecognition();
  recognition.lang = _langSelect ? _langSelect.value : 'te-IN';
  isListening = true;

  if (_micBtn) { _micBtn.classList.add('listening'); _micBtn.setAttribute('aria-label', 'Stop recording'); }
  if (_micLabel) _micLabel.textContent = 'Listening... tap to stop';
  if (_micSub) _micSub.textContent = 'Speak in Telugu, English or Hindi — keeps listening till you tap again';

  attachRecognitionHandlers();
  recognition.start();
}

export function stopListening() {
  isListening = false;
  manualStop = true;
  if (_micBtn) { _micBtn.classList.remove('listening'); _micBtn.setAttribute('aria-label', 'Start recording'); }
  if (_micLabel) _micLabel.textContent = 'Tap to speak';
}

export function getIsListening() { return isListening; }

export function toggleMic() {
  if (isListening) {
    manualStop = true;
    if (recognition) recognition.stop();
  } else {
    manualStop = false;
    startListening();
  }
}

// ── Text-to-Speech ───────────────────────────────────────────────────────────

let ttsVoices = [];

function loadTtsVoices() {
  if ('speechSynthesis' in window) ttsVoices = window.speechSynthesis.getVoices();
}
loadTtsVoices();
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadTtsVoices;

function pickMaleVoice() {
  if (!ttsVoices.length) loadTtsVoices();
  const maleHints = ['ravi', 'hemant', 'kalpana', 'male', 'man', 'david', 'mark', 'richard', 'daniel', 'google hindi male', 'google english india male', 'google uk english male', 'google us english'];
  const femaleExclude = ['female', 'woman', 'zira', 'samantha', 'victoria', 'susan', 'karen', 'moira', 'tessa', 'veena', 'heera', 'kalpana'];
  let v = ttsVoices.find(v => {
    const n = v.name.toLowerCase();
    const lang = (v.lang || '').toLowerCase();
    const isIndian = lang === 'en-in' || n.includes('india') || n.includes('ravi');
    const isFemale = femaleExclude.some(h => n.includes(h));
    return isIndian && !isFemale;
  });
  if (!v) v = ttsVoices.find(v => {
    const n = v.name.toLowerCase();
    const isMale = maleHints.some(h => n.includes(h));
    const isFemale = femaleExclude.some(h => n.includes(h));
    return isMale && !isFemale && (v.lang || '').startsWith('en');
  });
  if (!v) v = ttsVoices.find(v => (v.lang || '').startsWith('en'));
  return v || ttsVoices[0] || null;
}

export function speakText(text, onDone) {
  if (!('speechSynthesis' in window)) { if (onDone) onDone(); return; }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickMaleVoice();
  if (voice) utter.voice = voice;
  utter.rate = 0.85;
  utter.pitch = 0.92;
  utter.volume = 1;
  if (onDone) {
    const estMs = Math.max(1500, text.split(' ').length * 420);
    let called = false;
    const done = () => { if (!called) { called = true; onDone(); } };
    utter.onend = () => setTimeout(done, 200);
    setTimeout(done, estMs + 600);
  }
  window.speechSynthesis.speak(utter);
}

export function speakSequence(sentences, onAllDone) {
  if (!sentences || !sentences.length) { if (onAllDone) onAllDone(); return; }
  const [first, ...rest] = sentences;
  speakText(first, () => {
    setTimeout(() => speakSequence(rest, onAllDone), 300);
  });
}

// ── Single-shot voice listener (for voice commands) ──────────────────────────

export function listenOnce(onResult, onFail, timeoutMs) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { if (onFail) onFail('unsupported'); return; }

  const lang = _langSelect ? _langSelect.value : 'en-IN';
  const r = new SR();
  r.lang = lang;
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 3;
  let done = false;

  const finish = (said) => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    if (said) { onResult(said); } else { if (onFail) onFail('no-speech'); }
  };

  const timer = timeoutMs ? setTimeout(() => finish(null), timeoutMs) : null;

  r.onresult = (e) => {
    const said = Array.from(e.results[0])
      .map(alt => alt.transcript.trim())
      .filter(Boolean)
      .join(' | ');
    finish(said.split(' | ')[0]);
  };
  r.onerror = (e) => {
    if (e.error !== 'no-speech') console.warn('Voice cmd error:', e.error);
    finish(null);
  };
  r.onend = () => finish(null);

  try { r.start(); } catch (e) { if (onFail) onFail('start-error'); }
}
