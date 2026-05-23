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

const platformArtifacts = {
  "darwin-universal": findFirst([/\.app\.tar\.gz$/i]),
  "windows-x86_64": findFirst([
    /\.msi\.zip$/i,
    /setup\.nsis\.zip$/i,
    /\.msi$/i,
    /setup\.exe$/i,
  ]),
  "linux-x86_64": findFirst([/\.AppImage\.tar\.gz$/i]),
};

const platforms = {};
for (const [platform, fileName] of Object.entries(platformArtifacts)) {
  if (!fileName) continue;
  const signature = readSigForArtifact(fileName);
  if (!signature || signature.length < 20) continue;
  platforms[platform] = {
    signature,
    url: `${baseUrl}/${fileName}`,
  };
}

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
};

const outPath = path.join(uploadDir, "latest.json");
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("[latest-json] generated", {
  outPath,
  version,
  baseUrl,
  platforms: Object.keys(platforms),
});
