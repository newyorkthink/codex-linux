#!/usr/bin/env bash
# 将 OpenAI 官方 Linux amd64 DEB 重新封装为 AppImage；官方应用目录和 resources/app.asar 不做源码修改。
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

readonly OFFICIAL_DEB_URL="${CHATGPT_DEB_URL:-https://persistent.oaistatic.com/codex-app-prod/linux/deb/latest/chatgpt_amd64.deb}"
readonly BUILD_IMAGE="${CHATGPT_BUILD_IMAGE:-ubuntu:24.04}"

log() {
  printf '[ChatGPT Desktop] %s\n' "$*"
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

[[ "$(uname -m)" == "x86_64" ]] || die "当前构建仅支持 x86_64 / amd64。"
[[ "$OFFICIAL_DEB_URL" == https://persistent.oaistatic.com/codex-app-prod/linux/deb/* ]] || \
  die "CHATGPT_DEB_URL 必须指向 OpenAI 官方 persistent.oaistatic.com Linux DEB 路径。"
command -v docker >/dev/null 2>&1 || die "未找到 Docker。"
docker info >/dev/null 2>&1 || die "Docker daemon 不可用。"

rm -rf "$SCRIPT_DIR/AppDir" "$SCRIPT_DIR/dist"
mkdir -p "$SCRIPT_DIR/dist"

log "使用隔离构建环境：$BUILD_IMAGE"
docker run --rm -i \
  -v "$SCRIPT_DIR:/work" \
  -w /work \
  -e OFFICIAL_DEB_URL="$OFFICIAL_DEB_URL" \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  "$BUILD_IMAGE" \
  bash -s <<'INNER_EOF'
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive
export APPIMAGE_EXTRACT_AND_RUN=1
export ARCH=x86_64
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

readonly ROOT=/work
readonly APPDIR="$ROOT/AppDir"
readonly OUTDIR="$ROOT/dist"
readonly OUTFILE="$OUTDIR/chatgpt-desktop.AppImage"
readonly TMP_ROOT="$(mktemp -d)"
readonly DEB_FILE="$TMP_ROOT/chatgpt_amd64.deb"
readonly DESKTOP_COPY="$TMP_ROOT/chatgpt.desktop"
readonly ICON_COPY="$TMP_ROOT/chatgpt.png"
trap 'rm -rf "$TMP_ROOT"' EXIT

log() {
  printf '[ChatGPT Desktop] %s\n' "$*"
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

apt-get update
apt-get install -y --no-install-recommends \
  binutils \
  ca-certificates \
  coreutils \
  curl \
  desktop-file-utils \
  dpkg-dev \
  file \
  findutils \
  gawk \
  grep \
  libglib2.0-bin \
  patchelf \
  sed \
  squashfs-tools \
  tar \
  xz-utils \
  zstd

log "下载 OpenAI 官方 DEB"
curl --fail --location --retry 5 --retry-all-errors --proto '=https' \
  "$OFFICIAL_DEB_URL" -o "$DEB_FILE"
test -s "$DEB_FILE" || die "官方 DEB 下载结果为空。"

PACKAGE_NAME="$(dpkg-deb -f "$DEB_FILE" Package)"
PACKAGE_VERSION="$(dpkg-deb -f "$DEB_FILE" Version)"
PACKAGE_ARCH="$(dpkg-deb -f "$DEB_FILE" Architecture)"
[[ "$PACKAGE_NAME" == "chatgpt" ]] || die "官方 DEB Package 字段异常：$PACKAGE_NAME"
[[ "$PACKAGE_ARCH" == "amd64" ]] || die "官方 DEB Architecture 字段异常：$PACKAGE_ARCH"
[[ -n "$PACKAGE_VERSION" ]] || die "无法读取 ChatGPT Desktop 版本。"
DEB_SHA256="$(sha256sum "$DEB_FILE" | awk '{print $1}')"

# 在一次性 Ubuntu 24.04 容器中安装同一官方 DEB，仅用于让 linuxdeploy 解析官方声明的系统依赖。
apt-get install -y --no-install-recommends "$DEB_FILE"

rm -rf "$APPDIR"
mkdir -p "$APPDIR" "$OUTDIR"
dpkg-deb -x "$DEB_FILE" "$APPDIR"

readonly CHATGPT_ROOT="$APPDIR/usr/lib/chatgpt"
readonly INSTALLED_CHATGPT_ROOT=/usr/lib/chatgpt
readonly CHATGPT_BINARY="$CHATGPT_ROOT/ChatGPT"
readonly CODEX_LAUNCHER="$CHATGPT_ROOT/codex-launcher"
readonly APP_ASAR="$CHATGPT_ROOT/resources/app.asar"
readonly OFFICIAL_DESKTOP="$APPDIR/usr/share/applications/chatgpt.desktop"

[[ -x "$CHATGPT_BINARY" ]] || die "官方 DEB 中缺少 /usr/lib/chatgpt/ChatGPT。"
[[ -x "$CODEX_LAUNCHER" ]] || die "官方 DEB 中缺少 /usr/lib/chatgpt/codex-launcher。"
[[ -f "$APP_ASAR" ]] || die "官方 DEB 中缺少 resources/app.asar。"
[[ -f "$OFFICIAL_DESKTOP" ]] || die "官方 DEB 中缺少 chatgpt.desktop。"

OFFICIAL_ICON="$APPDIR/usr/share/pixmaps/chatgpt.png"
if [[ ! -f "$OFFICIAL_ICON" ]]; then
  OFFICIAL_ICON="$(find "$APPDIR/usr/share/icons" -type f -iname 'chatgpt*.png' -print | sort -V | tail -n1 || true)"
fi
[[ -n "$OFFICIAL_ICON" && -f "$OFFICIAL_ICON" ]] || die "官方 DEB 中找不到 ChatGPT PNG 图标。"

ASAR_SHA256_BEFORE="$(sha256sum "$APP_ASAR" | awk '{print $1}')"
CHATGPT_BINARY_SHA256_BEFORE="$(sha256sum "$CHATGPT_BINARY" | awk '{print $1}')"
CODEX_LAUNCHER_SHA256_BEFORE="$(sha256sum "$CODEX_LAUNCHER" | awk '{print $1}')"

cp -a "$OFFICIAL_DESKTOP" "$DESKTOP_COPY"
cp -a "$OFFICIAL_ICON" "$ICON_COPY"

# 仅调整 AppImage 外层 desktop 入口；不改官方应用代码、认证逻辑、代理设置或 CODEX_HOME。
sed -i -E \
  -e 's|^Exec=.*$|Exec=chatgpt %U|' \
  -e 's|^Icon=.*$|Icon=chatgpt|' \
  "$DESKTOP_COPY"
if ! grep -q '^StartupWMClass=' "$DESKTOP_COPY"; then
  printf '%s\n' 'StartupWMClass=Chatgpt' >> "$DESKTOP_COPY"
fi

curl --fail --location --retry 5 --retry-all-errors \
  https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage \
  -o "$TMP_ROOT/linuxdeploy"
curl --fail --location --retry 5 --retry-all-errors \
  https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage \
  -o "$TMP_ROOT/appimagetool"
chmod +x "$TMP_ROOT/linuxdeploy" "$TMP_ROOT/appimagetool"

LINUXDEPLOY_ARGS=(
  --appdir "$APPDIR"
  --desktop-file "$DESKTOP_COPY"
  --icon-file "$ICON_COPY"
  --executable "$INSTALLED_CHATGPT_ROOT/ChatGPT"
  --executable "$INSTALLED_CHATGPT_ROOT/codex-launcher"
)

# 扫描官方应用中的 ELF/Node 原生模块，把它们依赖到的系统运行库作为部署根节点；不复制或重写这些官方模块本身。
LIB_LIST="$TMP_ROOT/runtime-libs.txt"
MISSING_LIST="$TMP_ROOT/missing-libs.txt"
: > "$LIB_LIST"
: > "$MISSING_LIST"

while IFS= read -r -d '' native_file; do
  file -b "$native_file" | grep -q 'ELF' || continue
  ldd "$native_file" 2>/dev/null \
    | awk '/=> not found/ {print $1}' >> "$MISSING_LIST" || true
  ldd "$native_file" 2>/dev/null \
    | awk '/=> \/[^ ]+/ {print $3} /^[[:space:]]*\/[^ ]+[[:space:]]+\(/ {print $1}' \
    >> "$LIB_LIST" || true
done < <(find "$INSTALLED_CHATGPT_ROOT" -type f \
  \( -perm -0100 -o -name '*.node' -o -name '*.so' -o -name '*.so.*' \) \
  -print0)

sort -u -o "$LIB_LIST" "$LIB_LIST"
sort -u -o "$MISSING_LIST" "$MISSING_LIST"
if [[ -s "$MISSING_LIST" ]]; then
  cat "$MISSING_LIST" >&2
  die "官方 DEB 安装后仍存在未解析的 ELF 运行库。"
fi

while IFS= read -r runtime_lib; do
  [[ -f "$runtime_lib" ]] && LINUXDEPLOY_ARGS+=(--library "$runtime_lib")
done < "$LIB_LIST"

# NSS/Secret Service 等组件可能由 Chromium 在运行时动态加载，存在时显式加入部署集合。
for runtime_name in \
  libfreeblpriv3.so \
  libnssckbi.so \
  libsecret-1.so.0 \
  libsoftokn3.so; do
  runtime_path="$(ldconfig -p 2>/dev/null | awk -v name="$runtime_name" '$1 == name {print $NF; exit}')"
  [[ -n "$runtime_path" && -f "$runtime_path" ]] && LINUXDEPLOY_ARGS+=(--library "$runtime_path")
done

log "使用 linuxdeploy 补齐运行依赖"
NO_STRIP=1 "$TMP_ROOT/linuxdeploy" "${LINUXDEPLOY_ARGS[@]}"

ASAR_SHA256_AFTER="$(sha256sum "$APP_ASAR" | awk '{print $1}')"
CHATGPT_BINARY_SHA256_AFTER="$(sha256sum "$CHATGPT_BINARY" | awk '{print $1}')"
CODEX_LAUNCHER_SHA256_AFTER="$(sha256sum "$CODEX_LAUNCHER" | awk '{print $1}')"
[[ "$ASAR_SHA256_BEFORE" == "$ASAR_SHA256_AFTER" ]] || \
  die "linuxdeploy 意外修改了官方 resources/app.asar。"
[[ "$CHATGPT_BINARY_SHA256_BEFORE" == "$CHATGPT_BINARY_SHA256_AFTER" ]] || \
  die "linuxdeploy 意外修改了官方 ChatGPT 主程序。"
[[ "$CODEX_LAUNCHER_SHA256_BEFORE" == "$CODEX_LAUNCHER_SHA256_AFTER" ]] || \
  die "linuxdeploy 意外修改了官方 codex-launcher。"

cat > "$APPDIR/AppRun" <<'APPRUN_EOF'
#!/usr/bin/env bash
set -e

APPDIR="$(dirname "$(readlink -f "$0")")"
export APPDIR
export PATH="$APPDIR/usr/bin:${PATH:-/usr/bin:/bin}"
export XDG_DATA_DIRS="$APPDIR/usr/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"

LIB_PATH="$APPDIR/usr/lib:$APPDIR/usr/lib/x86_64-linux-gnu"
if [[ -n "${LD_LIBRARY_PATH:-}" ]]; then
  LIB_PATH="$LIB_PATH:$LD_LIBRARY_PATH"
fi
export LD_LIBRARY_PATH="$LIB_PATH"

exec "$APPDIR/usr/lib/chatgpt/codex-launcher" "$@"
APPRUN_EOF
chmod +x "$APPDIR/AppRun"

rm -f "$OUTFILE"
log "生成 AppImage"
"$TMP_ROOT/appimagetool" "$APPDIR" "$OUTFILE"
[[ -s "$OUTFILE" ]] || die "AppImage 构建失败。"

# 再从最终 AppImage 解包一次，确认封装后的官方 app.asar 仍与输入 DEB 完全一致。
FINAL_EXTRACT_DIR="$TMP_ROOT/final-extract"
mkdir -p "$FINAL_EXTRACT_DIR"
pushd "$FINAL_EXTRACT_DIR" >/dev/null
"$OUTFILE" --appimage-extract >/dev/null
popd >/dev/null
FINAL_APP_ASAR="$FINAL_EXTRACT_DIR/squashfs-root/usr/lib/chatgpt/resources/app.asar"
[[ -f "$FINAL_APP_ASAR" ]] || die "最终 AppImage 中缺少 resources/app.asar。"
FINAL_ASAR_SHA256="$(sha256sum "$FINAL_APP_ASAR" | awk '{print $1}')"
[[ "$ASAR_SHA256_BEFORE" == "$FINAL_ASAR_SHA256" ]] || \
  die "最终 AppImage 中的 resources/app.asar 与官方 DEB 不一致。"

APPIMAGE_SHA256="$(sha256sum "$OUTFILE" | awk '{print $1}')"
printf '%s\n' "$PACKAGE_VERSION" > "$OUTDIR/version.txt"
printf '%s  %s\n' "$DEB_SHA256" 'chatgpt_amd64.deb' > "$OUTDIR/official-deb.sha256"
printf '%s  %s\n' "$ASAR_SHA256_AFTER" 'resources/app.asar' > "$OUTDIR/official-app-asar.sha256"
printf '%s  %s\n' "$APPIMAGE_SHA256" "$(basename "$OUTFILE")" > "$OUTDIR/SHA256SUMS.txt"

# AppDir 只是中间目录，不保留在工作区；Release 只上传最终 AppImage 与校验文件。
rm -rf "$APPDIR"
chown -R "$HOST_UID:$HOST_GID" "$OUTDIR"

log "版本：$PACKAGE_VERSION"
log "官方 DEB SHA256：$DEB_SHA256"
log "官方 app.asar SHA256：$ASAR_SHA256_AFTER"
log "AppImage SHA256：$APPIMAGE_SHA256"
INNER_EOF

[[ -s "$SCRIPT_DIR/dist/chatgpt-desktop.AppImage" ]] || die "最终 AppImage 不存在或为空。"
log "构建完成：$SCRIPT_DIR/dist/chatgpt-desktop.AppImage"
