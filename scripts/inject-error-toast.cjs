const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'Sessions', 'ActiveSession', 'FloatingApp.tsx');
let c = fs.readFileSync(filePath, 'utf8');

const anchor = 'session-init", (event) => {';
const idx = c.indexOf(anchor);
if (idx === -1) { console.error('anchor not found'); process.exit(1); }

// Find the start of the enclosing useEffect (scan backward)
const before = c.lastIndexOf('useEffect(() => {', idx);
if (before === -1) { console.error('useEffect not found'); process.exit(1); }

// Check if we already injected it
if (c.includes('Remote audio: ${tabTranscription.error}')) {
  console.log('already injected, skip');
  process.exit(0);
}

const insertion =
  '  // Surface remote audio errors so the user knows if capture failed\n' +
  '  useEffect(() => {\n' +
  '    if (tabTranscription.error) {\n' +
  '      toast.error(`Remote audio: ${tabTranscription.error}`, { duration: 6000 });\n' +
  '    }\n' +
  '  }, [tabTranscription.error]);\n\n';

c = c.slice(0, before) + insertion + c.slice(before);
fs.writeFileSync(filePath, c, 'utf8');
console.log('injected at offset', before);
