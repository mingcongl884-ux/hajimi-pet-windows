# Changelog

All notable installer-facing changes for HaJiMi are tracked here.

## 0.1.43 - 2026-05-11

- Fixed file upload handling so `.xlsx` files are parsed into readable worksheet text instead of raw ZIP binary content.
- Added Codex-like assistant processing duration display for normal chat, office chat, and channel-triggered replies.
- Made WeChat ClawBot setup stop HaJiMi's active bridge before QR login and avoid deleting the live plugin directory while Windows still has it locked.

## 0.1.42 - 2026-05-11

- Fixed installed WeChat ClawBot QR startup by writing the setup flow to a short PowerShell script file before opening it, avoiding Windows command-line truncation from the previous encoded command.
- Moved the direct WeChat message bridge into HaJiMi's bundled Node 22 worker process so the current chat/office conversation bridge avoids Electron's `webidl.util.markAsUncloneable` runtime incompatibility.
- Kept the WeChat bridge reply path connected to the selected model and pet action pipeline after QR login.

## 0.1.41 - 2026-05-11

- Added a direct built-in WeChat ClawBot message bridge so WeChat messages enter the currently selected HaJiMi chat or office conversation and replies are sent back to WeChat.
- Auto-pair first-time WeChat senders while the channel is in pairing mode, and route future messages through the same current-conversation pipeline.
- Forward pet action tool calls from WeChat-triggered model replies to the visible desktop pet, so remote chat can still move, speak, or change the pet.
- Cleaned the channel adapter source and updated WeChat setup copy to reflect that HaJiMi can receive messages directly after QR login.

## 0.1.40 - 2026-05-11

- Fixed installed WeChat ClawBot QR startup by calling the bundled WeChat plugin login flow directly instead of the outer `openclaw channels login` command that could hang before printing a QR code.
- Made the channel setup terminal launch through a Windows `cmd start` wrapper so the scan window is more reliably visible from the packaged Electron app.

## 0.1.39 - 2026-05-11

- Added the delayed OpenClaw runtime dependencies required by WeChat channel registration and QR login to the packaged app.
- Fixed stale WeChat plugin setup paths by ensuring the packaged runtime can rebuild the local plugin dependency tree from the current install directory.

## 0.1.38 - 2026-05-11

- Fixed packaged WeChat/OpenClaw detection so HaJiMi looks inside its bundled `resources/app.asar.unpacked/node_modules` runtime before falling back to a system `openclaw` command.
- Improved the channel test error copy to distinguish a missing OpenClaw install from a bundled OpenClaw launch failure.

## 0.1.37 - 2026-05-10

- Made two-pet play focus mostly on slower, longer "chase and follow" scenes while keeping brief approach/jump moments.
- Stabilized settings saves with serialized writes and Windows rename retries to avoid occasional `settings.json` write failures.
- Synchronized imported/switched pets with the active pet list, paused together-play while chat is open, and saved each pet window position independently.
- Improved pet action movement by using the current real window position before jump/move commands and fixed reminder movement on offset displays.

## 0.1.36 - 2026-05-10

- Accept OpenAI-compatible base URLs that already include `/v1` without producing a duplicated `/v1/v1/chat/completions` request.
- Reuse the same endpoint normalization in normal chat and the OpenAI-compatible office agent path.

## 0.1.35 - 2026-05-09

- Bundle Tencent's WeChat ClawBot channel plugin itself and copy it into the isolated HaJiMi OpenClaw state directory instead of relying on the official npm installer path.
- Copy the QR-code and Zod runtime dependencies beside the plugin, refresh the OpenClaw plugin registry, enable `openclaw-weixin`, and launch the verbose QR login command directly.
- Update the channel page copy so WeChat setup no longer says a separate OpenClaw install is required.

## 0.1.34 - 2026-05-09

- Repair corrupted `settings.json` files that contain extra trailing JSON so the app can open instead of stopping on the initial-state load.
- Save settings through a temporary file before replacing the main file to reduce future config corruption.

## 0.1.33 - 2026-05-09

- Bundled OpenClaw and a Node 22 runtime, then generate a local `openclaw.cmd` shim so WeChat setup can proceed without a global OpenClaw install.
- Kept OpenClaw state isolated under the HaJiMi user data directory.
- Compact the Codex-like sidebar navigation so management tabs stay tucked in the corner.

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
