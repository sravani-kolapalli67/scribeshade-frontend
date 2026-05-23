const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const uploadDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "r2-upload");

const defaultBaseUrl =
  "https://pub-992f115513ba42f681595c2ca5fac628.r2.dev/tauri-updates";
const baseUrl = (process.env.UPDATER_PUBLIC_BASE_URL || defaultBaseUrl).replace(
  /\/+$/,
  "",
);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

if (!fs.existsSync(uploadDir)) {
  console.error(`[latest-json] upload dir does not exist: ${uploadDir}`);
  process.exit(1);
}

const files = fs.readdirSync(uploadDir);

function findFirst(patterns) {
  for (const re of patterns) {
    const hit = files.find((f) => re.test(f));
    if (hit) return hit;
  }
  return null;
}

function readSigForArtifact(fileName) {
  const sigName = `${fileName}.sig`;
  const sigPath = path.join(uploadDir, sigName);
  if (!fs.existsSync(sigPath)) return null;
  return fs.readFileSync(sigPath, "utf8").trim();
}

function artifactInfo(fileName) {
  if (!fileName) return null;
  return {
    url: `${baseUrl}/${fileName}`,
    signature: readSigForArtifact(fileName) || undefined,
  };
}

const macUpdaterArtifact = findFirst([/\.app\.tar\.gz$/i]);
const windowsUpdaterArtifact = findFirst([
  /\.msi\.zip$/i,
  /setup\.nsis\.zip$/i,
  /\.msi$/i,
  /setup\.exe$/i,
]);
const linuxUpdaterArtifact = findFirst([/\.AppImage\.tar\.gz$/i, /\.AppImage$/i]);

const platformArtifacts = [
  // Keep universal key and also provide arch keys expected by Tauri fallback logic.
  ["darwin-aarch64", macUpdaterArtifact],
  ["darwin-x86_64", macUpdaterArtifact],
  ["darwin-universal", macUpdaterArtifact],
  ["windows-x86_64", windowsUpdaterArtifact],
  // Keep canonical key and an explicit appimage alias for consumers.
  ["linux-x86_64", linuxUpdaterArtifact],
  ["linux-x86_64-appimage", linuxUpdaterArtifact],
];

const platforms = {};
for (const [platform, fileName] of platformArtifacts) {
  if (!fileName) continue;
  const signature = readSigForArtifact(fileName);
  if (!signature || signature.length < 20) continue;
  platforms[platform] = {
    signature,
    url: `${baseUrl}/${fileName}`,
  };
}

const downloads = {
  mac: {
    dmg: artifactInfo(findFirst([/\.dmg$/i])),
    appTarGz: artifactInfo(findFirst([/\.app\.tar\.gz$/i])),
  },
  windows: {
    exe: artifactInfo(findFirst([/setup\.exe$/i, /\.exe$/i])),
    msi: artifactInfo(findFirst([/\.msi$/i])),
    msiZip: artifactInfo(findFirst([/\.msi\.zip$/i])),
    nsisZip: artifactInfo(findFirst([/setup\.nsis\.zip$/i])),
  },
  linux: {
    appImage: artifactInfo(findFirst([/\.AppImage$/i, /\.AppImage\.tar\.gz$/i])),
    deb: artifactInfo(findFirst([/\.deb$/i])),
    rpm: artifactInfo(findFirst([/\.rpm$/i])),
  },
};

if (Object.keys(platforms).length === 0) {
  console.error(
    "[latest-json] no valid updater artifacts with signatures found in r2-upload",
  );
  process.exit(1);
}

const manifest = {
  version,
  notes: `ScribeShade ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
  downloads,
};

const outPath = path.join(uploadDir, "latest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("[latest-json] generated", {
  outPath,
  version,
  baseUrl,
  platforms: Object.keys(platforms),
  updaterArtifacts: {
    mac: macUpdaterArtifact || null,
    windows: windowsUpdaterArtifact || null,
    linux: linuxUpdaterArtifact || null,
  },
  discoveredArtifacts: {
    mac: {
      dmg: downloads.mac.dmg?.url || null,
      appTarGz: downloads.mac.appTarGz?.url || null,
    },
    windows: {
      exe: downloads.windows.exe?.url || null,
      msi: downloads.windows.msi?.url || null,
      msiZip: downloads.windows.msiZip?.url || null,
      nsisZip: downloads.windows.nsisZip?.url || null,
    },
    linux: {
      appImage: downloads.linux.appImage?.url || null,
      deb: downloads.linux.deb?.url || null,
      rpm: downloads.linux.rpm?.url || null,
    },
  },
});
