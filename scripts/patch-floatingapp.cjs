const fs = require('fs');
const f = 'd:/ScribeShade/scribeshade-01-frontend/src/pages/Sessions/ActiveSession/FloatingApp.tsx';
let c = fs.readFileSync(f, 'utf8');
const NL = '\r\n';

// ─────────────────────────────────────────────────────────────
// REPLACEMENT 1: Replace useDeepgram block + startMicRef + effects
// ─────────────────────────────────────────────────────────────
const OLD_DEEPGRAM_BLOCK = [
  '  const micTranscription = useDeepgram({',
  '    apiKey: DEEPGRAM_KEY,',
  '    model: "nova-3",',
  '    language: getLanguageCode(sessionInfo?.language ?? "English"),',
  '    onTranscript: handleUserTranscript,',
  '  });',
  '',
  '  // Keep ref fresh so session-init listener can call startTranscription',
  '  const startMicRef = useRef(micTranscription.startTranscription);',
  '  startMicRef.current = micTranscription.startTranscription;',
  '',
  '  // Auto-start mic when sessionInfo is first available.',
  '  // Covers two cases:',
  '  //   1. session-init event fires AFTER this component mounts (normal flow)',
  '  //   2. sessionInfo is pre-loaded from sessionStorage (mini window reload /',
  "  //      window already open) \u2014 session-init was already processed, won't fire again.",
  '  // The session-init listener also calls startMicRef after 500 ms; the idempotency',
  '  // guard inside useDeepgram.startTranscription prevents a double-start.',
  '  const micAutoStartedRef = useRef(false);',
  '  useEffect(() => {',
  '    if (!sessionInfo || micAutoStartedRef.current) return;',
  '    micAutoStartedRef.current = true;',
  '    const t = setTimeout(() => startMicRef.current(), 300);',
  '    return () => clearTimeout(t);',
  '  // Re-run only when the sessionId changes (new session)',
  '  // eslint-disable-next-line react-hooks/exhaustive-deps',
  '  }, [sessionInfo?.sessionId]);',
  '',
  '  // Surface mic errors as toasts \u2014 show only once per unique error message to',
  '  // avoid toast spam when the auto-retry loop fires repeatedly.',
  '  const lastMicErrorRef = useRef<string | null>(null);',
  '  useEffect(() => {',
  '    if (micTranscription.error && micTranscription.error !== lastMicErrorRef.current) {',
  '      lastMicErrorRef.current = micTranscription.error;',
  '      toast.error(`Mic: ${micTranscription.error}`, { duration: 6000 });',
  '    }',
  '    if (!micTranscription.error) {',
  '      lastMicErrorRef.current = null; // clear so new errors surface again',
  '    }',
  '  }, [micTranscription.error]);',
].join(NL);

const NEW_MIC_BLOCK = [
  '  const {',
  '    status: micStatus,',
  '    isEnabled: isMicEnabled,',
  '    interimTranscript: micInterimTranscript,',
  '    error: micError,',
  '    toggle: toggleMic,',
  '    clearInterim: clearMicInterim,',
  '  } = useMiniMicAudio(sessionInfo?.sessionId, {',
  '    apiKey: DEEPGRAM_KEY,',
  '    model: "nova-3",',
  '    language: getLanguageCode(sessionInfo?.language ?? "English"),',
  '    onFinalTranscript: handleUserFinal,',
  '  });',
  '',
  '  // Surface mic errors as toasts \u2014 show only once per unique error message.',
  '  const lastMicErrorRef = useRef<string | null>(null);',
  '  useEffect(() => {',
  '    if (micError && micError !== lastMicErrorRef.current) {',
  '      lastMicErrorRef.current = micError;',
  '      toast.error(`Mic: ${micError}`, { duration: 6000 });',
  '    }',
  '    if (!micError) {',
  '      lastMicErrorRef.current = null;',
  '    }',
  '  }, [micError]);',
].join(NL);

if (c.includes(OLD_DEEPGRAM_BLOCK)) {
  c = c.replace(OLD_DEEPGRAM_BLOCK, NEW_MIC_BLOCK);
  console.log('Replacement 1: SUCCESS (useDeepgram -> useMiniMicAudio)');
} else {
  console.log('Replacement 1: FAIL - partial match search:');
  const lines = OLD_DEEPGRAM_BLOCK.split(NL);
  for (let i = 0; i < lines.length; i++) {
    if (!c.includes(lines[i])) console.log('  Missing line', i + 1, ':', JSON.stringify(lines[i].substring(0, 80)));
  }
}

// ─────────────────────────────────────────────────────────────
// REPLACEMENT 2: Add isEnabled + toggle to useMiniRemoteAudio destructuring
// ─────────────────────────────────────────────────────────────
const OLD_REMOTE = [
  '  const {',
  '    status: tabStatus,',
  '    interimTranscript: tabInterimTranscript,',
  '    clearInterim: clearTabInterim,',
  '  } = useMiniRemoteAudio(sessionInfo?.sessionId, {',
].join(NL);

const NEW_REMOTE = [
  '  const {',
  '    status: tabStatus,',
  '    isEnabled: isTabEnabled,',
  '    interimTranscript: tabInterimTranscript,',
  '    toggle: toggleTab,',
  '    clearInterim: clearTabInterim,',
  '  } = useMiniRemoteAudio(sessionInfo?.sessionId, {',
].join(NL);

if (c.includes(OLD_REMOTE)) {
  c = c.replace(OLD_REMOTE, NEW_REMOTE);
  console.log('Replacement 2: SUCCESS (useMiniRemoteAudio + isEnabled + toggle)');
} else {
  console.log('Replacement 2: FAIL');
}

// ─────────────────────────────────────────────────────────────
// REPLACEMENT 3: Remove startMicRef.current() from session-init listener
// ─────────────────────────────────────────────────────────────
const OLD_SESSION_INIT = [
  '      // Auto-start mic after a short delay so Deepgram hook has settled',
  '      setTimeout(() => startMicRef.current(), 500);',
].join(NL);

if (c.includes(OLD_SESSION_INIT)) {
  c = c.replace(OLD_SESSION_INIT, '      // useMiniMicAudio auto-starts when sessionId is set.');
  console.log('Replacement 3: SUCCESS (removed startMicRef from session-init)');
} else {
  // Try without the comment line
  const alt = '      setTimeout(() => startMicRef.current(), 500);' + NL;
  if (c.includes(alt)) {
    c = c.replace(alt, '');
    console.log('Replacement 3: SUCCESS (alt)');
  } else {
    console.log('Replacement 3: FAIL - line not found');
  }
}

fs.writeFileSync(f, c, 'utf8');
console.log('File saved.');
