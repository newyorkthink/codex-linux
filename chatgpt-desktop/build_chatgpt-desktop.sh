#!/usr/bin/env bash
# 将 OpenAI 官方 Linux amd64 DEB 直接重新封装为 AppImage；应用资源使用官方 DEB 原文件。
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OFFICIAL_DEB_URL="${CHATGPT_DEB_URL:-https://persistent.oaistatic.com/codex-app-prod/linux/deb/latest/chatgpt_amd64.deb}"
DEB_FILE=/tmp/chatgpt_amd64.deb
DEB_ROOT=/tmp/chatgpt-deb-root

ARCH="$(uname -m)"
if [[ "$ARCH" != "x86_64" ]]; then
  echo "Error: this script only supports x86_64 / amd64."
  exit 1
fi
export ARCH

if [[ "$OFFICIAL_DEB_URL" != https://persistent.oaistatic.com/codex-app-prod/linux/deb/* ]]; then
  echo "Error: CHATGPT_DEB_URL must use OpenAI's persistent.oaistatic.com Linux DEB repository."
  exit 1
fi

rm -rf ./AppDir ./dist "$DEB_ROOT"
rm -f "$DEB_FILE"

# 安装基础打包工具和依赖。
yay -S --noconfirm gcc base-devel curl wget tar gzip xz zstd binutils dpkg patchelf coreutils \
  appstream-glib desktop-file-utils util-linux zsync \
  xorg-server xorg-server-common xorg-server-xvfb

# 安装 ChatGPT Desktop / Electron 运行相关依赖，供 quick-sharun 收集运行库。
yay -S --noconfirm at-spi2-core alsa-lib cairo cups dbus expat glib2 gtk3 libnotify libsecret \
  libdrm libusb mesa nspr nss pango systemd-libs xdg-utils \
  libx11 libxcb libxcomposite libxdamage libxext libxfixes libxi libxkbcommon libxrandr \
  libxrender libxss libxtst \
  libglvnd libva libvdpau pulseaudio pulseaudio-alsa pipewire-audio ibus inetutils

export APPNAME=ChatGPT
export STARTUPWMCLASS=Chatgpt
export OUTPATH=./dist
export OUTNAME="chatgpt-desktop.AppImage"
# 固定 AppImage 主入口为官方 ChatGPT Electron 主程序，与已验证的 Stock / i3bar Fixed 启动链保持一致。
export MAIN_BIN=ChatGPT
export DEPLOY_GTK=1
export DEPLOY_OPENGL=1
export DEPLOY_VULKAN=1
export DEPLOY_PIPEWIRE=1

# 下载 OpenAI 官方 ChatGPT Desktop amd64 DEB。
wget --retry-connrefused --tries=30 "$OFFICIAL_DEB_URL" -O "$DEB_FILE"

PACKAGE_NAME="$(dpkg-deb -f "$DEB_FILE" Package)"
PACKAGE_VERSION="$(dpkg-deb -f "$DEB_FILE" Version)"
PACKAGE_ARCH="$(dpkg-deb -f "$DEB_FILE" Architecture)"

if [[ "$PACKAGE_NAME" != "chatgpt" ]]; then
  echo "Error: unexpected DEB package name: $PACKAGE_NAME"
  exit 1
fi

if [[ "$PACKAGE_ARCH" != "amd64" ]]; then
  echo "Error: unexpected DEB architecture: $PACKAGE_ARCH"
  exit 1
fi

if [[ -z "$PACKAGE_VERSION" ]]; then
  echo "Error: failed to read ChatGPT Desktop version."
  exit 1
fi

DEB_SHA256="$(sha256sum "$DEB_FILE" | awk '{print $1}')"
echo "ChatGPT Desktop version: $PACKAGE_VERSION"

# 解包官方 DEB；只重新排列 AppImage 目录，不修改官方应用源码或 resources/app.asar。
mkdir -p "$DEB_ROOT" ./AppDir/bin ./AppDir/share/applications ./AppDir/share/pixmaps ./dist
dpkg-deb -x "$DEB_FILE" "$DEB_ROOT"

if [[ ! -x "$DEB_ROOT/usr/lib/chatgpt/ChatGPT" ]]; then
  echo "Error: official ChatGPT executable not found."
  exit 1
fi

if [[ ! -x "$DEB_ROOT/usr/lib/chatgpt/codex-launcher" ]]; then
  echo "Error: official codex-launcher not found."
  exit 1
fi

if [[ ! -f "$DEB_ROOT/usr/lib/chatgpt/resources/app.asar" ]]; then
  echo "Error: official resources/app.asar not found."
  exit 1
fi

if [[ ! -f "$DEB_ROOT/usr/share/applications/chatgpt.desktop" ]]; then
  echo "Error: official chatgpt.desktop not found."
  exit 1
fi

if [[ ! -f "$DEB_ROOT/usr/share/pixmaps/chatgpt.png" ]]; then
  echo "Error: official chatgpt.png not found."
  exit 1
fi

cp -a "$DEB_ROOT/usr/lib/chatgpt/." ./AppDir/bin/
cp -a "$DEB_ROOT/usr/share/applications/chatgpt.desktop" ./AppDir/share/applications/chatgpt.desktop
cp -a "$DEB_ROOT/usr/share/pixmaps/chatgpt.png" ./AppDir/share/pixmaps/chatgpt.png

# 官方 DEB 的 /usr/bin/chatgpt 指向 codex-launcher；AppImage 继续保留 codex-launcher 文件，
# 但入口名称 chatgpt 改为直接进入 ChatGPT 主程序，复用已验证的 Stock / i3bar Fixed 启动链。
ln -sfn ChatGPT ./AppDir/bin/chatgpt

test "$(readlink ./AppDir/bin/chatgpt)" = "ChatGPT"
test -x ./AppDir/bin/codex-launcher

export DESKTOP=./AppDir/share/applications/chatgpt.desktop
export ICON=./AppDir/share/pixmaps/chatgpt.png

# 记录官方 DEB 中原始 resources/app.asar 的 SHA256，供 Release 标明上游来源。
OFFICIAL_ASAR_SHA256="$(sha256sum ./AppDir/bin/resources/app.asar | awk '{print $1}')"

# 使用与 linux-packaging 中 VS Code / Cursor 相同的 quick-sharun 路线。
# 只把 AppImage 直达的 ChatGPT 主程序作为主入口；codex-launcher 保留在包内但不参与 AppImage 启动链。
# resources 中的可选 musl/Qt 组件保持原样，不做手工 ELF 扫描。
quick-sharun \
  ./AppDir/bin/chatgpt \
  ./AppDir/bin/ChatGPT \
  /usr/bin/hostname \
  /usr/lib/libnss* \
  /usr/lib/libsoftokn3.so \
  /usr/lib/libfreeblpriv3.so \
  /usr/lib/pkcs11/* \
  /usr/lib/gtk-3.0/3.0.0/immodules/im-ibus.so

# quick-sharun 会把 AppRun.sh 的默认启动目标写入 MAIN_BIN；必须保持为 ChatGPT，不能回退到 codex-launcher。
test "$(grep -Fxc 'MAIN_BIN=ChatGPT' ./AppDir/AppRun.sh)" -eq 1

if [[ ! -L ./AppDir/shared/bin/chatgpt ]] || [[ "$(readlink ./AppDir/shared/bin/chatgpt)" != "ChatGPT" ]]; then
  echo "Error: AppImage chatgpt entry no longer resolves directly to ChatGPT."
  exit 1
fi

# 在 quick-sharun 生成的 AppRun.sh 中加入 Desktop 专用 CODEX_HOME；
# 只修改 AppImage 外层启动器，不修改官方 resources/app.asar 或应用代码。
APP_RUN=./AppDir/AppRun.sh
APP_RUN_TMP=./AppDir/AppRun.sh.tmp
APP_RUN_ANCHOR='# Check if ARG0 matches a binary, fallback to $1, then binary in .desktop'

if [[ "$(grep -Fxc "$APP_RUN_ANCHOR" "$APP_RUN")" -ne 1 ]]; then
  echo "Error: unexpected quick-sharun AppRun.sh structure."
  exit 1
fi

awk -v anchor="$APP_RUN_ANCHOR" '
  $0 == anchor {
    print "# ChatGPT Desktop AppImage 使用独立的 CODEX_HOME，避免与主机 Codex CLI 的 ~/.codex 共用配置、认证和本地状态"
    print "CHATGPT_DESKTOP_CODEX_HOME=\"${CHATGPT_DESKTOP_CODEX_HOME:-$HOME/.codex-chatgpt-desktop}\""
    print "mkdir -p -- \"$CHATGPT_DESKTOP_CODEX_HOME\""
    print "export CODEX_HOME=\"$CHATGPT_DESKTOP_CODEX_HOME\""
    print ""
  }
  { print }
' "$APP_RUN" > "$APP_RUN_TMP"

mv "$APP_RUN_TMP" "$APP_RUN"
chmod +x "$APP_RUN"

sh -n "$APP_RUN"
test "$(grep -Fxc 'MAIN_BIN=ChatGPT' "$APP_RUN")" -eq 1
test "$(grep -Fxc 'CHATGPT_DESKTOP_CODEX_HOME="${CHATGPT_DESKTOP_CODEX_HOME:-$HOME/.codex-chatgpt-desktop}"' "$APP_RUN")" -eq 1
test "$(grep -Fxc 'mkdir -p -- "$CHATGPT_DESKTOP_CODEX_HOME"' "$APP_RUN")" -eq 1
test "$(grep -Fxc 'export CODEX_HOME="$CHATGPT_DESKTOP_CODEX_HOME"' "$APP_RUN")" -eq 1

quick-sharun --make-appimage

if [[ ! -s ./dist/chatgpt-desktop.AppImage ]]; then
  echo "Error: chatgpt-desktop.AppImage was not created."
  exit 1
fi

APPIMAGE_SHA256="$(sha256sum ./dist/chatgpt-desktop.AppImage | awk '{print $1}')"
printf '%s\n' "$PACKAGE_VERSION" > ./dist/version.txt
printf '%s  %s\n' "$DEB_SHA256" 'chatgpt_amd64.deb' > ./dist/official-deb.sha256
printf '%s  %s\n' "$OFFICIAL_ASAR_SHA256" 'resources/app.asar' > ./dist/official-app-asar.sha256
printf '%s  %s\n' "$APPIMAGE_SHA256" 'chatgpt-desktop.AppImage' > ./dist/SHA256SUMS.txt

rm -rf "$DEB_ROOT"
rm -f "$DEB_FILE"

echo "Built: $SCRIPT_DIR/dist/chatgpt-desktop.AppImage"
