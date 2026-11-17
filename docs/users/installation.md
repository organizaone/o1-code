# Installation

There are two ways to install O1-Code. The installer is the default: it needs nothing installed
first. The npm package is for people who already manage tools with Node.js.

## Installer

macOS and Linux:

```bash
curl -fsSL https://github.com/organizaone/o1-code/releases/latest/download/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://github.com/organizaone/o1-code/releases/latest/download/install.ps1 | iex
```

The installer downloads O1-Code together with its own Node.js runtime, checks the download against
the published SHA-256 checksum, and installs it for your user only. It does not need administrator
rights or `sudo`, and it does not touch a Node.js you already have.

| System          | Supported by the installer              |
| --------------- | --------------------------------------- |
| macOS           | Apple silicon and Intel                 |
| Linux           | x64 and arm64, with glibc 2.28 or later |
| Windows         | 64-bit Intel/AMD                        |
| Everything else | Use the npm package                     |

On Linux distributions based on musl (Alpine, for example) and on Windows on ARM, install with npm.

### What it installs

| System          | Program                              | Launcher                                 |
| --------------- | ------------------------------------ | ---------------------------------------- |
| macOS and Linux | `~/.local/lib/o1-code`               | `~/.local/bin/o1-code`                   |
| Windows         | `%LOCALAPPDATA%\o1-code\lib\o1-code` | `%LOCALAPPDATA%\o1-code\bin\o1-code.cmd` |

The launcher's directory is added to your `PATH`: on Windows in your user `PATH`, on macOS and
Linux in a marked block at the end of your shell profile (`.zshrc`, `.bashrc` or `config.fish`).
Open a new terminal afterwards. Your settings and sessions stay in `~/.o1-code`, the same place
the npm package uses.

### Options

Options go after the script. On macOS and Linux:

```bash
curl -fsSL https://github.com/organizaone/o1-code/releases/latest/download/install.sh | bash -s -- --version 0.28.0
```

On Windows:

```powershell
& ([scriptblock]::Create((irm https://github.com/organizaone/o1-code/releases/latest/download/install.ps1))) -Version 0.28.0
```

| macOS and Linux    | Windows           | Environment variable            | Effect                                               |
| ------------------ | ----------------- | ------------------------------- | ---------------------------------------------------- |
| `--version X.Y.Z`  | `-Version X.Y.Z`  | `O1CODE_INSTALL_VERSION`        | Install that version instead of the latest.          |
| `--prefix DIR`     | `-InstallDir DIR` | `O1CODE_INSTALL_DIR`            | Install under another directory.                     |
| `--no-modify-path` | `-NoModifyPath`   | `O1CODE_INSTALL_NO_MODIFY_PATH` | Leave `PATH` alone; set to `1` as a variable.        |
| `--uninstall`      | `-Uninstall`      |                                 | Remove the installation.                             |
|                    |                   | `O1CODE_INSTALL_BASE_URL`       | Read one version's files from another HTTPS address. |

`O1CODE_INSTALL_BASE_URL` points at a directory holding the archive for your system and
`SHA256SUMS`, named as in an official release.

### Update

```bash
o1-code update
```

O1-Code also checks for a new version when it starts. The previous version is kept beside the
installation, and `/doctor rollback` goes back to it.

### Uninstall

macOS and Linux:

```bash
curl -fsSL https://github.com/organizaone/o1-code/releases/latest/download/install.sh | bash -s -- --uninstall
```

Windows:

```powershell
& ([scriptblock]::Create((irm https://github.com/organizaone/o1-code/releases/latest/download/install.ps1))) -Uninstall
```

This removes the program, the launcher and the `PATH` entry. Your settings in `~/.o1-code` are
kept; delete that directory yourself to remove them too.

## npm

With Node.js 22 or later ([nodejs.org](https://nodejs.org/en/download)):

```bash
npm install -g @organizaone/o1-code@latest
```

Run the same command again to update, and `npm uninstall -g @organizaone/o1-code` to remove it. To
try O1-Code without installing it, run `npx @organizaone/o1-code@latest`.

## Moving from npm to the installer

Both installations use the same settings, so nothing has to be migrated. Remove the npm package
first, so that only one `o1-code` is on your `PATH`, then run the installer:

```bash
npm uninstall -g @organizaone/o1-code
```

If both are installed, the one that comes first in `PATH` runs. The installer warns when it finds
another `o1-code` there.
