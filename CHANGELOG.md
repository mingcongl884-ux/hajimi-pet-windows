# Changelog

All notable installer-facing changes for HaJiMi are tracked here.

## 0.1.32 - 2026-05-09

- Bundled Tencent's WeChat ClawBot installer CLI and use it before falling back to online `npx`.
- Fixed the visible Windows terminal launch for Feishu/WeChat channel setup.
- Made each project in the Codex-like sidebar expandable/collapsible with its own conversations.
- Moved pet bubbles lower and removed the bubble shadow.

## 0.1.31 - 2026-05-09

- Fixed update checks reading an older unsaved network configuration when the system page URL field had not blurred yet.
- Migrated older empty update/notice URLs back to the GitHub defaults so installed clients can find releases again.

## 0.1.30 - 2026-05-09

- Updated WeChat channel setup to use Tencent's official ClawBot command: `npx -y @tencent-weixin/openclaw-weixin-cli@latest install`.
- Added visible terminal launch for OpenClaw Feishu/WeChat setup and `openclaw channels status --probe` checks.
- Added Codex-like multi-project management in the sidebar with project-scoped conversations.

## 0.1.29 - 2026-05-09

- Added first-phase Feishu and WeChat channel settings with pairing/allowlist routing foundations.
- Added channel adapter IPC skeletons for Feishu and WeChat plugin/sidecar flows.
- Added model-safe pet action controls so chat responses can move, speak, jump, or change the desktop pet state.

## 0.1.28 - 2026-05-09

- Added an in-app update flow in the system page: check, download, then restart to install without opening GitHub manually.

## 0.1.27 - 2026-05-09

- Fixed GitHub Actions heartbeat schedule tests so release publishing works consistently across runner time zones.

## 0.1.26 - 2026-05-09

- Added a GitHub Actions release workflow to build and upload Windows installer assets from tags.
- Made fresh installs start with the smallest pet scale.
- Widened the default manager window.

## 0.1.25 - 2026-05-09

- Set GitHub Releases as the default update feed.
- Added `notices.json` as the default GitHub-hosted announcement feed.
- Documented the public repository requirement for installed clients.

## 0.1.24 - 2026-05-09

- Lowered the pet size slider minimum to `0.5` for a Codex-like small pet size.

## 0.1.23 - 2026-05-09

- Removed the pet-side hover action toolbar.
- Kept pet click as the only shortcut for opening the chat panel.
- Reduced pet-window interactive hit testing to the pet canvas, bubble, and chat panel.

## 0.1.22 - 2026-05-09

- Narrowed pet-window mouse capture so transparent areas pass clicks through to the desktop.
- Moved the pet chat panel closer to the pet.
- Built installer: `HaJiMi-Setup-0.1.22.exe`.

## 0.1.21 - 2026-05-09

- Added optional multi-pet play for two active pets.
- Pets can approach, chase, and jump together when the feature is enabled.

## 0.1.20 - 2026-05-09

- Made fresh installs default to a smaller lively pet.
- Smoothed pet bubble corners.

## 0.1.19 - 2026-05-09

- Applied the confirmed pet bubble placement from the browser position demo.

## 0.1.18 - 2026-05-09

- Fixed packaged startup by loading `electron-updater` through its CommonJS-compatible default export.

## 0.1.17 - 2026-05-09

- Removed the extra renderer shadow around pet sprites so cutouts stay clean.

## 0.1.16 - 2026-05-09

- Added configurable online update checks.
- Added remote announcement notices.

## 0.1.15 - 2026-05-09

- Added imported pet rename and delete support.
- Locked the built-in HaJiMi pet so it cannot be renamed or deleted.
- Documented installer versions.

## 0.1.14 - 2026-05-09

- Added office conversation rename and delete controls.

## 0.1.13 - 2026-05-09

- Added the ordinary/advanced office mode switch in the workspace.

## 0.1.12 - 2026-05-09

- Added Claude Agent SDK as advanced office mode.

## 0.1.11 - 2026-05-09

- Adjusted pet chat panel placement and interaction polish.

## 0.1.10 - 2026-05-09

- Renamed the app to HaJiMi.
- Polished model configuration and input styling.
