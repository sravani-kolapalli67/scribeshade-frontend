const fs = require('fs');
const path = require('path');

const DEFAULT_BASE_URL = 'https://pub-992f115513ba42f681595c2ca5fac628.r2.dev/tauri-updates';

const root = path.resolve(__dirname, '..');
const manifestPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      root,
      'src-tauri',
      'target',
      'universal-apple-darwin',
      'release',
      'bundle',
      'macos',
      'latest.json',
    );

const baseUrl = (process.env.UPDATER_PUBLIC_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

if (!fs.existsSync(manifestPath)) {
  console.error(`[updater-manifest] latest.json not found at ${manifestPath}`);
  process.exit(1);
}

const manifestDir = path.dirname(manifestPath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (!manifest.platforms || typeof manifest.platforms !== 'object') {
  console.error('[updater-manifest] invalid manifest: missing platforms object');
  process.exit(1);
}

const filenameByPlatform = {
  'darwin-universal': 'ScribeShade.app.tar.gz',
  'darwin-aarch64': 'ScribeShade.app.tar.gz',
  'darwin-x86_64': 'ScribeShade.app.tar.gz',
  'windows-x86_64': 'ScribeShade.msi.zip',
  'linux-x86_64': 'ScribeShade.AppImage.tar.gz',
};

const signatureByFile = {};
const possibleArtifacts = [
  'ScribeShade.app.tar.gz',
  'ScribeShade.msi.zip',
  'ScribeShade.AppImage.tar.gz',
];

for (const artifactName of possibleArtifacts) {
  const sigPath = path.join(manifestDir, `${artifactName}.sig`);
  if (fs.existsSync(sigPath)) {
    signatureByFile[artifactName] = fs.readFileSync(sigPath, 'utf8').trim();
  }
}

const nextPlatforms = {};

for (const [platform, meta] of Object.entries(manifest.platforms)) {
  if (!meta || typeof meta !== 'object') continue;

  let filename = filenameByPlatform[platform];
  if (!filename) {
    if (typeof meta.url === 'string' && meta.url.trim().length > 0) {
      try {
        const parsed = new URL(meta.url);
        filename = path.basename(parsed.pathname);
      } catch {
        filename = path.basename(meta.url);
      }
    }
  }

  if (!filename || filename === '.' || filename === '/') {
    continue;
  }

  const sig = signatureByFile[filename];
  if (!sig || sig.length <= 50) {
    console.warn(`[updater-manifest] dropping platform without fresh signature: ${platform}`);
    continue;
  }

  nextPlatforms[platform] = {
    ...meta,
    signature: sig,
    url: `${baseUrl}/${filename}`,
  };
}

manifest.platforms = nextPlatforms;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log('[updater-manifest] patched', {
  manifestPath,
  baseUrl,
  platforms: Object.keys(manifest.platforms),
});
