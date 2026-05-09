# HaJiMi Pet Windows

Standalone Windows desktop pet app with HaJiMi bundled by default.

## Features

- Transparent desktop pet with a separate manager window.
- Built-in HaJiMi pet is locked: it cannot be renamed or deleted.
- Import pet folders or zip archives containing `pet.json` and `spritesheet.webp`.
- Rename imported pets, delete imported pets, and enable up to two pets at the same time.
- Optional autonomous walking/running behavior.
- Office workspace with conversations, file sending, permission modes, and model selection.
- Ordinary office mode for OpenAI-compatible APIs.
- Advanced office mode with Claude Agent SDK.

## Pet Format

Each pet bundle must contain:

```text
pet.json
spritesheet.webp
```

The spritesheet must be 8 columns by 9 rows. Rows map to:

```text
0 idle
1 running right
2 running left
3 waving
4 jumping
5 failed
6 waiting
7 running
8 review
```

The app accepts a folder or a `.zip` file. The two required files can be at the root or inside one first-level folder.

## Model Setup

In `模型配置`, each model has a provider:

- `OpenAI 兼容`: uses `/v1/chat/completions` and the built-in HaJiMi office tools.
- `Claude Agent SDK`: uses `@anthropic-ai/claude-agent-sdk` for advanced office mode.

Claude Agent SDK mode usually uses:

```text
API Base URL: https://api.anthropic.com
Model: claude-sonnet-4-6
```

Other models can still use ordinary office mode through an OpenAI-compatible endpoint. To use another model in advanced mode, the gateway must be Anthropic/Claude-compatible.

## GitHub Updates And Notices

Fresh installs point to GitHub by default:

- `更新源 URL`: `https://github.com/mingcongl884-ux/hajimi-pet-windows/releases/latest/download`
- `公告 JSON URL`: `https://raw.githubusercontent.com/mingcongl884-ux/hajimi-pet-windows/main/notices.json`

The app checks these sources on startup when automatic checks are enabled, then repeats about every 6 hours while running. Manual checks are available in `系统 -> 联网更新与公告`.

For GitHub updates to work for other people, the repository or hosted release assets must be public. Private repositories require authentication and cannot be read by normal installed clients.

For each release, publish the files generated in `dist/` as GitHub Release assets:

```text
HaJiMi-Setup-x.y.z.exe
HaJiMi-Setup-x.y.z.exe.blockmap
latest.yml
```

For notices, edit `notices.json` on the default branch. The app accepts either an array of notices or `{ "notices": [...] }`.

## Installer Versions

Installers are generated in `dist/`.

| Version | Installer | Notes |
| --- | --- | --- |
| 0.1.10 | `HaJiMi-Setup-0.1.10.exe` | Renamed the app to HaJiMi and polished model configuration/input styling. |
| 0.1.11 | `HaJiMi-Setup-0.1.11.exe` | Adjusted pet chat panel placement and interaction polish. |
| 0.1.12 | `HaJiMi-Setup-0.1.12.exe` | Added Claude Agent SDK as advanced office mode. |
| 0.1.13 | `HaJiMi-Setup-0.1.13.exe` | Added the ordinary/advanced office mode switch in the workspace. |
| 0.1.14 | `HaJiMi-Setup-0.1.14.exe` | Added office conversation rename and delete controls. |
| 0.1.15 | `HaJiMi-Setup-0.1.15.exe` | Adds imported pet rename/delete, locks built-in HaJiMi, and documents installer versions. |
| 0.1.16 | `HaJiMi-Setup-0.1.16.exe` | Adds configurable online update checks and remote announcement notices. |
| 0.1.17 | `HaJiMi-Setup-0.1.17.exe` | Removes the extra renderer shadow around pet sprites so cutouts stay clean. |
| 0.1.18 | `HaJiMi-Setup-0.1.18.exe` | Fixes packaged startup by loading electron-updater through its CommonJS-compatible default export. |
| 0.1.19 | `HaJiMi-Setup-0.1.19.exe` | Applies the confirmed pet bubble placement from the position demo. |
| 0.1.20 | `HaJiMi-Setup-0.1.20.exe` | Makes fresh installs default to a smaller lively pet and smooths pet bubble corners. |
| 0.1.21 | `HaJiMi-Setup-0.1.21.exe` | Adds optional multi-pet play so two active pets can approach, chase, and jump together. |
| 0.1.22 | `HaJiMi-Setup-0.1.22.exe` | Narrows pet-window mouse capture to visible controls and moves the pet chat panel closer. |
| 0.1.23 | `HaJiMi-Setup-0.1.23.exe` | Removes the pet-side hover action toolbar and keeps pet click as the chat shortcut. |
| 0.1.24 | `HaJiMi-Setup-0.1.24.exe` | Lowers the pet size slider minimum to a Codex-like small size. |
| 0.1.25 | `HaJiMi-Setup-0.1.25.exe` | Uses GitHub Releases and `notices.json` as the default update and notice feeds. |

Use the latest installer unless you need to compare a previous build.

## Development

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run package:installer
```
