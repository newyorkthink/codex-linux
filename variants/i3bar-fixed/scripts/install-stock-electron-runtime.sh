#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
    printf '[stock-electron][ERROR] %s\n' "$*" >&2
    exit 1
}

info() {
    printf '[stock-electron] %s\n' "$*"
}

app_dir="${1:-}"
[ -n "$app_dir" ] || fail "usage: $0 <codex-app-directory>"
app_dir="$(realpath "$app_dir")"

[ -x "$app_dir/ChatGPT" ] || fail "missing ChatGPT runtime in $app_dir"
[ -f "$app_dir/version" ] || fail "missing runtime version in $app_dir"
[ -f "$app_dir/resources/app.asar" ] || fail "missing app.asar in $app_dir"
[ -d "$app_dir/resources/app.asar.unpacked" ] || fail "missing app.asar.unpacked in $app_dir"

electron_version="$(tr -d '\r\n' < "$app_dir/version")"
[[ "$electron_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]] || \
    fail "invalid Electron version: $electron_version"

case "$(uname -m)" in
    x86_64|amd64) electron_arch=x64 ;;
    aarch64|arm64) electron_arch=arm64 ;;
    *) fail "unsupported architecture: $(uname -m)" ;;
esac

cache_dir="${CODEX_STOCK_ELECTRON_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/codex-stock-electron}"
mkdir -p "$cache_dir"

zip_name="electron-v${electron_version}-linux-${electron_arch}.zip"
zip_path="$cache_dir/$zip_name"
checksums_path="$cache_dir/SHASUMS256-v${electron_version}.txt"
release_url="https://github.com/electron/electron/releases/download/v$electron_version"

if [ ! -s "$zip_path" ]; then
    info "downloading stock Electron $electron_version ($electron_arch)"
    curl -fL --retry 3 --continue-at - \
        -o "$zip_path.part" "$release_url/$zip_name"
    mv "$zip_path.part" "$zip_path"
fi

curl -fsSL --retry 3 -o "$checksums_path.part" "$release_url/SHASUMS256.txt"
mv "$checksums_path.part" "$checksums_path"

expected_sha="$(
    awk -v name="$zip_name" '
        $2 == name || $2 == "*" name { print $1; exit }
    ' "$checksums_path"
)"
[ -n "$expected_sha" ] || fail "Electron checksum entry is missing for $zip_name"
actual_sha="$(sha256sum "$zip_path" | awk '{print $1}')"
[ "$actual_sha" = "$expected_sha" ] || fail "Electron archive checksum mismatch"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
runtime_dir="$work_dir/runtime"
native_dir="$work_dir/native-build"
rebuild_home="$cache_dir/rebuild-home"
mkdir -p "$runtime_dir" "$native_dir" "$rebuild_home"
unzip -q "$zip_path" -d "$runtime_dir"

[ "$(tr -d '\r\n' < "$runtime_dir/version")" = "$electron_version" ] || \
    fail "extracted Electron version does not match $electron_version"

tray_symbols=(
    gtk_status_icon_new
    gtk_status_icon_set_from_pixbuf
    gtk_status_icon_set_tooltip_text
    gtk_status_icon_set_visible
    gtk_status_icon_position_menu
)
for symbol in "${tray_symbols[@]}"; do
    objdump -T "$runtime_dir/electron" | grep -F "$symbol" >/dev/null || \
        fail "stock Electron is missing required XEmbed symbol: $symbol"
done

(
    cd "$native_dir"
    npm init --yes >/dev/null
    npm install --save-dev --ignore-scripts \
        "electron@$electron_version" \
        "@electron/rebuild@4.0.4" \
        "node-abi@^4.31.0" \
        "@electron/asar@3.4.1" >/dev/null
)

mapfile -t native_versions < <(
    node - "$native_dir" "$app_dir/resources/app.asar" <<'NODE'
const path = require("node:path");
const [nativeDir, asarPath] = process.argv.slice(2);
const asar = require(path.join(nativeDir, "node_modules/@electron/asar"));
for (const moduleName of ["better-sqlite3", "node-pty"]) {
  const bytes = asar.extractFile(
    asarPath,
    `node_modules/${moduleName}/package.json`,
  );
  const pkg = JSON.parse(bytes.toString("utf8"));
  if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
    throw new Error(`Invalid ${moduleName} version in app.asar`);
  }
  console.log(pkg.version);
}
NODE
)
[ "${#native_versions[@]}" -eq 2 ] || fail "could not read native module versions"
better_sqlite3_version="${native_versions[0]}"
node_pty_version="${native_versions[1]}"

info "rebuilding better-sqlite3@$better_sqlite3_version and node-pty@$node_pty_version"
(
    cd "$native_dir"
    npm install --save-exact --ignore-scripts \
        "better-sqlite3@$better_sqlite3_version" \
        "node-pty@$node_pty_version" >/dev/null
)

node - "$native_dir/node_modules/better-sqlite3" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const moduleDir = process.argv[2];
const files = {
  main: path.join(moduleDir, "src/better_sqlite3.cpp"),
  helpers: path.join(moduleDir, "src/util/helpers.cpp"),
  macros: path.join(moduleDir, "src/util/macros.cpp"),
};

function replaceOnce(file, needle, replacement) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(replacement)) return;
  if (!source.includes(needle)) {
    throw new Error(`Could not find the Electron 42 compatibility needle in ${file}`);
  }
  fs.writeFileSync(file, source.replace(needle, replacement));
}

replaceOnce(
  files.main,
  "v8::Local<v8::External> data = v8::External::New(isolate, addon);",
  "v8::Local<v8::External> data = BETTER_SQLITE3_EXTERNAL_NEW(isolate, addon);",
);
replaceOnce(
  files.macros,
  `#define EasyIsolate v8::Isolate* isolate = v8::Isolate::GetCurrent()
#define OnlyIsolate info.GetIsolate()
#define OnlyContext isolate->GetCurrentContext()
#define OnlyAddon static_cast<Addon*>(info.Data().As<v8::External>()->Value())`,
  `#if defined(V8_MAJOR_VERSION) && V8_MAJOR_VERSION >= 14
#define BETTER_SQLITE3_EXTERNAL_POINTER_TAG v8::kExternalPointerTypeTagDefault
#define BETTER_SQLITE3_EXTERNAL_NEW(isolate, value) v8::External::New((isolate), (value), BETTER_SQLITE3_EXTERNAL_POINTER_TAG)
#define BETTER_SQLITE3_EXTERNAL_VALUE(external) ((external)->Value(BETTER_SQLITE3_EXTERNAL_POINTER_TAG))
#else
#define BETTER_SQLITE3_EXTERNAL_NEW(isolate, value) v8::External::New((isolate), (value))
#define BETTER_SQLITE3_EXTERNAL_VALUE(external) ((external)->Value())
#endif

#define EasyIsolate v8::Isolate* isolate = v8::Isolate::GetCurrent()
#define OnlyIsolate info.GetIsolate()
#define OnlyContext isolate->GetCurrentContext()
#define OnlyAddon static_cast<Addon*>(BETTER_SQLITE3_EXTERNAL_VALUE(info.Data().As<v8::External>()))`,
);
replaceOnce(
  files.helpers,
  "\t\tfunc,\n\t\t0,\n\t\tdata",
  "\t\tfunc,\n\t\tnullptr,\n\t\tdata",
);
NODE

# @electron/rebuild hard-codes os.homedir() for its header and prebuild
# caches. Redirect those temporary caches without changing the caller's HOME.
node - \
    "$native_dir/node_modules/@electron/rebuild/lib/constants.js" \
    "$native_dir/node_modules/@electron/rebuild/lib/rebuild.js" \
    "$rebuild_home" <<'NODE'
const fs = require("node:fs");
const files = process.argv.slice(2, 4);
const rebuildHome = process.argv[4];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("os.homedir()")) {
    throw new Error(`Could not redirect @electron/rebuild cache in ${file}`);
  }
  fs.writeFileSync(file, source.replaceAll("os.homedir()", JSON.stringify(rebuildHome)));
}
NODE

(
    cd "$native_dir"
    npm_config_disturl=https://artifacts.electronjs.org/headers/dist \
    NPM_CONFIG_DISTURL=https://artifacts.electronjs.org/headers/dist \
        node node_modules/@electron/rebuild/lib/cli.js \
        --version "$electron_version" \
        --force \
        --dist-url https://artifacts.electronjs.org/headers/dist
)

better_source="$native_dir/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
pty_source="$native_dir/node_modules/node-pty/build/Release/pty.node"
better_target="$app_dir/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
pty_target="$app_dir/resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node"
[ -f "$better_source" ] || fail "rebuilt better_sqlite3.node is missing"
[ -f "$pty_source" ] || fail "rebuilt pty.node is missing"
[ -f "$better_target" ] || fail "packaged better_sqlite3.node target is missing"
[ -f "$pty_target" ] || fail "packaged pty.node target is missing"

ELECTRON_RUN_AS_NODE=1 "$runtime_dir/electron" -e '
for (const modulePath of process.argv.slice(1)) require(modulePath);
console.log(`native ABI ${process.versions.modules}: OK`);
' "$better_source" "$pty_source"

runtime_files=(
    LICENSE
    LICENSES.chromium.html
    chrome-sandbox
    chrome_100_percent.pak
    chrome_200_percent.pak
    chrome_crashpad_handler
    icudtl.dat
    libEGL.so
    libGLESv2.so
    libffmpeg.so
    libvk_swiftshader.so
    libvulkan.so.1
    resources.pak
    snapshot_blob.bin
    v8_context_snapshot.bin
    version
    vk_swiftshader_icd.json
)
for file in "${runtime_files[@]}"; do
    [ -e "$runtime_dir/$file" ] || fail "stock Electron payload is missing $file"
    cp -a "$runtime_dir/$file" "$app_dir/$file"
done
mkdir -p "$app_dir/locales"
cp -a "$runtime_dir/locales/." "$app_dir/locales/"
install -m 0755 "$runtime_dir/electron" "$app_dir/ChatGPT"
install -m 0755 "$better_source" "$better_target"
install -m 0755 "$pty_source" "$pty_target"

cmp -s "$runtime_dir/electron" "$app_dir/ChatGPT" || fail "stock Electron binary copy failed"
if ldd "$app_dir/ChatGPT" | grep -F 'not found' >/dev/null; then
    ldd "$app_dir/ChatGPT" >&2
    fail "stock Electron has unresolved shared libraries"
fi
for symbol in "${tray_symbols[@]}"; do
    objdump -T "$app_dir/ChatGPT" | grep -F "$symbol" >/dev/null || \
        fail "packaged runtime lost required XEmbed symbol: $symbol"
done

ELECTRON_RUN_AS_NODE=1 "$app_dir/ChatGPT" -e '
const expected = process.argv[1];
if (process.versions.electron !== expected) {
  throw new Error(`Expected Electron ${expected}, got ${process.versions.electron}`);
}
for (const modulePath of process.argv.slice(2)) require(modulePath);
console.log(JSON.stringify({
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  modules: process.versions.modules,
  nativeModules: "ok",
}));
' "$electron_version" "$better_target" "$pty_target"

mkdir -p "$app_dir/.codex-linux"
node - "$app_dir/.codex-linux/stock-electron-runtime.json" \
    "$electron_version" "$actual_sha" <<'NODE'
const fs = require("node:fs");
const [output, electronVersion, archiveSha256] = process.argv.slice(2);
fs.writeFileSync(output, `${JSON.stringify({
  schemaVersion: 1,
  runtime: "stock-electron",
  electronVersion,
  archiveSha256,
  trayBackend: "GtkStatusIcon/XEmbed",
}, null, 2)}\n`);
NODE

info "installed stock Electron $electron_version with GtkStatusIcon/XEmbed"
