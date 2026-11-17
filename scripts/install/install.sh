#!/usr/bin/env bash
# Copyright 2026 o1-code contributors
# SPDX-License-Identifier: Apache-2.0
#
# Installs o1-code for the current user on Linux and macOS, with its own
# Node.js runtime. Nothing is installed system-wide and sudo is not needed.
#
#   curl -fsSL https://github.com/organizaone/o1-code/releases/latest/download/install.sh | bash
#   curl -fsSL .../install.sh | bash -s -- --version 0.28.0
#   curl -fsSL .../install.sh | bash -s -- --uninstall
#
# Options (each also reads the environment variable beside it):
#   --version X.Y.Z     O1CODE_INSTALL_VERSION         Version to install. Default: latest.
#   --prefix DIR        O1CODE_INSTALL_DIR             Install prefix. Default: ~/.local.
#   --no-modify-path    O1CODE_INSTALL_NO_MODIFY_PATH  Leave the shell profile alone.
#   --uninstall                                        Remove the installation, keep settings.
#   O1CODE_INSTALL_BASE_URL  Directory holding the archive and SHA256SUMS of one version.
#
# The layout is <prefix>/lib/o1-code (the program) and <prefix>/bin/o1-code
# (a launcher). The program updates itself in that layout, so the launcher
# and the PATH block below must stay as packages/cli/src/ui/standalone-update.ts
# writes them.

set -euo pipefail

REPO_URL='https://github.com/organizaone/o1-code'
PACKAGE_NAME='@organizaone/o1-code'
PATH_BLOCK_BEGIN='# O1-Code PATH block begin'
PATH_BLOCK_END='# O1-Code PATH block end'
NPM_HINT="Install with npm instead: npm install -g ${PACKAGE_NAME}"

PREFIX=''
NO_MODIFY_PATH='0'
WORK_DIR=''
STAGING_DIR=''

say() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

has() { command -v "$1" >/dev/null 2>&1; }

cleanup() {
  if [[ -n "${WORK_DIR}" ]]; then rm -rf "${WORK_DIR}"; fi
  if [[ -n "${STAGING_DIR}" ]]; then rm -rf "${STAGING_DIR}"; fi
}

# Single-quoted for sh, as shellQuoteForSh does in the updater.
shell_quote() {
  local escaped
  escaped="$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
  printf "'%s'" "${escaped}"
}

usage() {
  cat <<'USAGE'
Installs o1-code for the current user, with its own Node.js runtime.

  --version X.Y.Z     Version to install. Default: latest.
  --prefix DIR        Install prefix. Default: ~/.local.
  --no-modify-path    Leave the shell profile alone.
  --uninstall         Remove the installation, keep settings.
USAGE
}

# The bundled Node.js runtime is the official glibc build, which needs
# glibc 2.28 or later and does not run on musl.
check_linux_libc() {
  local ldd_output version major minor
  ldd_output="$(ldd --version 2>&1 || true)"
  if [[ -e /etc/alpine-release ]] || [[ "${ldd_output}" == *musl* ]]; then
    die "musl-based systems are not supported by this installer. ${NPM_HINT}"
  fi
  version="$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"
  version="${version##* }"
  if [[ "${version}" =~ ^([0-9]+)\.([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
    minor="${BASH_REMATCH[2]}"
    if ((major < 2 || (major == 2 && minor < 28))); then
      die "glibc ${version} is older than 2.28, which the bundled runtime needs. ${NPM_HINT}"
    fi
  fi
}

detect_target() {
  local system machine os arch translated
  system="$(uname -s)"
  machine="$(uname -m)"
  case "${system}" in
    Linux) os='linux' ;;
    Darwin) os='darwin' ;;
    MINGW* | MSYS* | CYGWIN*)
      die "this script is for Linux and macOS. On Windows, run in PowerShell: irm ${REPO_URL}/releases/latest/download/install.ps1 | iex"
      ;;
    *) die "unsupported operating system: ${system}. ${NPM_HINT}" ;;
  esac
  case "${machine}" in
    x86_64 | amd64) arch='x64' ;;
    arm64 | aarch64) arch='arm64' ;;
    *) die "unsupported architecture: ${machine}. ${NPM_HINT}" ;;
  esac
  # A translated shell on Apple silicon reports x86_64; install the native build.
  if [[ "${os}" == 'darwin' && "${arch}" == 'x64' ]]; then
    translated="$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)"
    if [[ "${translated}" == '1' ]]; then arch='arm64'; fi
  fi
  if [[ "${os}" == 'linux' ]]; then
    check_linux_libc
  fi
  printf '%s-%s' "${os}" "${arch}"
}

download() {
  local url="$1" destination="$2"
  if has curl; then
    curl -fsSL --retry 3 --connect-timeout 20 -o "${destination}" "${url}"
  elif has wget; then
    wget -q --tries=3 --timeout=20 -O "${destination}" "${url}"
  else
    die 'curl or wget is required'
  fi
}

sha256_of() {
  local output
  if has sha256sum; then
    output="$(sha256sum "$1")"
    printf '%s' "${output%% *}"
  elif has shasum; then
    output="$(shasum -a 256 "$1")"
    printf '%s' "${output%% *}"
  elif has openssl; then
    output="$(openssl dgst -sha256 "$1")"
    printf '%s' "${output##* }"
  else
    die 'sha256sum, shasum or openssl is required to verify the download'
  fi
}

base_url_for() {
  local version="$1" base
  if [[ -n "${O1CODE_INSTALL_BASE_URL:-}" ]]; then
    base="${O1CODE_INSTALL_BASE_URL%/}"
    case "${base}" in
      https://* | http://127.0.0.1:* | http://localhost:*) printf '%s' "${base}" ;;
      *) die 'O1CODE_INSTALL_BASE_URL must be an https:// URL' ;;
    esac
  elif [[ "${version}" == 'latest' ]]; then
    printf '%s/releases/latest/download' "${REPO_URL}"
  else
    printf '%s/releases/download/v%s' "${REPO_URL}" "${version}"
  fi
}

# True when the directory is an o1-code installation this script may replace.
is_o1code_install() {
  [[ -f "$1/manifest.json" ]] && grep -q "\"name\": *\"${PACKAGE_NAME}\"" "$1/manifest.json"
}

manifest_version() {
  local line
  line="$(grep -m 1 '"version":' "$1/manifest.json" || true)"
  line="${line#*\"version\": \"}"
  printf '%s' "${line%%\"*}"
}

rc_file_for_shell() {
  case "${SHELL:-}" in
    */zsh) printf '%s' "${HOME}/.zshrc" ;;
    */bash)
      if [[ -f "${HOME}/.bashrc" ]]; then
        printf '%s' "${HOME}/.bashrc"
      elif [[ -f "${HOME}/.bash_profile" ]]; then
        printf '%s' "${HOME}/.bash_profile"
      else
        printf '%s' "${HOME}/.bashrc"
      fi
      ;;
    */fish) printf '%s' "${HOME}/.config/fish/config.fish" ;;
    *) ;;
  esac
}

add_to_path() {
  local bin_dir="$1" rc_file rc_dir quoted export_line
  case ":${PATH}:" in
    *":${bin_dir}:"*) return 0 ;;
    *) ;;
  esac
  rc_file="$(rc_file_for_shell)"
  if [[ "${NO_MODIFY_PATH}" == '1' || -z "${rc_file}" ]]; then
    say "Add ${bin_dir} to your PATH to run o1-code."
    return 0
  fi
  if [[ -f "${rc_file}" ]] && grep -qF "${PATH_BLOCK_BEGIN}" "${rc_file}"; then
    say 'Open a new terminal to run o1-code.'
    return 0
  fi
  quoted="$(shell_quote "${bin_dir}")"
  case "${SHELL:-}" in
    */fish) export_line="set -gx PATH ${quoted} \$PATH" ;;
    *) export_line="export PATH=${quoted}:\$PATH" ;;
  esac
  rc_dir="$(dirname "${rc_file}")"
  mkdir -p "${rc_dir}"
  printf '\n%s\n%s\n%s\n' "${PATH_BLOCK_BEGIN}" "${export_line}" "${PATH_BLOCK_END}" >>"${rc_file}"
  say "Added ${bin_dir} to PATH in ${rc_file}. Open a new terminal to run o1-code."
}

remove_path_block() {
  local rc_file temporary
  for rc_file in "${HOME}/.zshrc" "${HOME}/.bashrc" "${HOME}/.bash_profile" "${HOME}/.config/fish/config.fish"; do
    if [[ ! -f "${rc_file}" ]] || ! grep -qF "${PATH_BLOCK_BEGIN}" "${rc_file}"; then
      continue
    fi
    temporary="$(mktemp)"
    awk -v begin="${PATH_BLOCK_BEGIN}" -v end="${PATH_BLOCK_END}" '
      $0 == begin { skipping = 1; next }
      $0 == end { skipping = 0; next }
      !skipping { print }
    ' "${rc_file}" >"${temporary}"
    cat "${temporary}" >"${rc_file}"
    rm -f "${temporary}"
    say "Removed the PATH block from ${rc_file}."
  done
}

# Another o1-code earlier on PATH (an npm installation, usually) would run
# instead of this one.
warn_about_other_installs() {
  local launcher="$1" found
  found="$(command -v o1-code 2>/dev/null || true)"
  if [[ -n "${found}" && "${found}" != "${launcher}" ]]; then
    warn "another o1-code is on your PATH at ${found} and may run instead of this one."
    warn "If it came from npm, remove it with: npm uninstall -g ${PACKAGE_NAME}"
  fi
}

uninstall() {
  local install_dir="$1" launcher="$2" removed='0'
  if [[ -d "${install_dir}" ]]; then
    if ! is_o1code_install "${install_dir}"; then
      die "${install_dir} is not an o1-code installation; nothing was removed"
    fi
    rm -rf "${install_dir}"
    removed='1'
  fi
  rm -rf "${install_dir}.old" "${install_dir}.new"
  if [[ -f "${launcher}" ]] && grep -qF "${install_dir}" "${launcher}"; then
    rm -f "${launcher}"
    removed='1'
  fi
  remove_path_block
  if [[ "${removed}" == '1' ]]; then
    say 'o1-code was removed. Your settings in ~/.o1-code were kept.'
  else
    say "No o1-code installation was found under ${PREFIX}."
  fi
}

install() {
  local version="$1" install_dir="$2" launcher="$3"
  local target archive base_url expected actual listing staged lib_dir bin_dir
  local line file started_version staged_version quoted
  target="$(detect_target)"
  archive="o1-code-${target}.tar.gz"
  base_url="$(base_url_for "${version}")"

  if [[ -e "${install_dir}" ]] && ! is_o1code_install "${install_dir}"; then
    die "${install_dir} exists and is not an o1-code installation. Move it away or choose another --prefix."
  fi

  WORK_DIR="$(mktemp -d)"
  trap cleanup EXIT

  say "Downloading o1-code (${version}, ${target})..."
  download "${base_url}/SHA256SUMS" "${WORK_DIR}/SHA256SUMS"
  download "${base_url}/${archive}" "${WORK_DIR}/${archive}"

  expected=''
  while read -r line file; do
    if [[ "${file#\*}" == "${archive}" ]]; then
      expected="${line}"
      break
    fi
  done <"${WORK_DIR}/SHA256SUMS"
  if [[ -z "${expected}" ]]; then
    die "SHA256SUMS does not list ${archive}"
  fi
  actual="$(sha256_of "${WORK_DIR}/${archive}")"
  if [[ "${actual}" != "${expected}" ]]; then
    die "checksum mismatch for ${archive}: expected ${expected}, got ${actual}"
  fi

  listing="$(tar -tzf "${WORK_DIR}/${archive}")"
  if grep -Eq '(^/|(^|/)\.\.(/|$))' <<<"${listing}"; then
    die 'the archive contains an unsafe path'
  fi

  # Extracted beside the destination so the final move stays on one filesystem.
  lib_dir="$(dirname "${install_dir}")"
  bin_dir="$(dirname "${launcher}")"
  mkdir -p "${lib_dir}" "${bin_dir}"
  STAGING_DIR="$(mktemp -d "${lib_dir}/.o1-code-install-XXXXXX")"
  tar -xzf "${WORK_DIR}/${archive}" -C "${STAGING_DIR}"
  staged="${STAGING_DIR}/o1-code"
  if ! is_o1code_install "${staged}" || [[ ! -x "${staged}/bin/o1-code" || ! -x "${staged}/node/bin/node" ]]; then
    die 'the archive does not contain an o1-code installation'
  fi
  started_version="$("${staged}/bin/o1-code" --version 2>/dev/null || true)"
  staged_version="$(manifest_version "${staged}")"
  if [[ "${started_version}" != "${staged_version}" ]]; then
    die "the downloaded o1-code does not start on this system (got '${started_version}'). ${NPM_HINT}"
  fi

  # The previous version stays in .old, where /doctor rollback finds it.
  if [[ -d "${install_dir}" ]]; then
    rm -rf "${install_dir}.old"
    mv "${install_dir}" "${install_dir}.old"
    if ! mv "${staged}" "${install_dir}"; then
      mv "${install_dir}.old" "${install_dir}"
      die "could not replace ${install_dir}"
    fi
  else
    mv "${staged}" "${install_dir}"
  fi

  quoted="$(shell_quote "${install_dir}/bin/o1-code")"
  printf '#!/usr/bin/env sh\nexec %s "$@"\n' "${quoted}" >"${launcher}"
  chmod 755 "${launcher}"

  say "o1-code ${started_version} is installed in ${install_dir}."
  add_to_path "${bin_dir}"
  warn_about_other_installs "${launcher}"
}

main() {
  local version="${O1CODE_INSTALL_VERSION:-latest}"
  local action='install' user_id install_dir launcher
  PREFIX="${O1CODE_INSTALL_DIR:-${HOME}/.local}"
  NO_MODIFY_PATH="${O1CODE_INSTALL_NO_MODIFY_PATH:-0}"

  while (($# > 0)); do
    case "$1" in
      --version)
        if (($# < 2)); then die '--version needs a value'; fi
        version="$2"
        shift 2
        ;;
      --prefix)
        if (($# < 2)); then die '--prefix needs a value'; fi
        PREFIX="$2"
        shift 2
        ;;
      --no-modify-path)
        NO_MODIFY_PATH='1'
        shift
        ;;
      --uninstall)
        action='uninstall'
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $1" ;;
    esac
  done

  version="${version#v}"
  if [[ "${version}" != 'latest' && ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "'${version}' is not a version like 0.28.0"
  fi
  if [[ "${PREFIX}" != /* ]]; then
    die '--prefix must be an absolute path'
  fi
  if [[ "${PREFIX}" == *$'\n'* || "${PREFIX}" == *$'\r'* ]]; then
    die '--prefix must not contain line breaks'
  fi
  user_id="$(id -u)"
  if [[ "${user_id}" == '0' ]]; then
    warn 'running as root installs o1-code for the root user only.'
  fi

  install_dir="${PREFIX%/}/lib/o1-code"
  launcher="${PREFIX%/}/bin/o1-code"
  if [[ "${action}" == 'uninstall' ]]; then
    uninstall "${install_dir}" "${launcher}"
  else
    install "${version}" "${install_dir}" "${launcher}"
  fi
}

# Everything runs from here, so a download cut short never runs half a script.
main "$@"
