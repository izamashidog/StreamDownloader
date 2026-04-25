# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a browser extension for downloading M3U8 (HLS) and MPD (DASH) video streams. The goal is to create an open-source, cross-platform browser extension that allows users to easily download streaming video content.

**Key Documents:**
- `docs/产品需求文档.md` - Product Requirements Document (PRD)
- `docs/竞品分析.md` - Competitive Analysis Report

## Architecture

The extension follows Chrome MV3 architecture:

```
┌──────────────────────────────────────┐
│            Browser Context            │
│  ┌────────┐  ┌───────────┐           │
│  │ Popup  │  │ SidePanel │           │
│  └───┬────┘  └─────┬─────┘           │
│      └──────┬──────┘                 │
│      ┌──────┴──────┐                 │
│      │  ServiceWorker                 │
│      │  - Sniffer Engine              │
│      │  - Download Manager            │
│      └──────┬──────┘                 │
│      ┌──────┴──────┐                 │
│      │  Parser Pages                  │
│      │  - M3U8 Parser                 │
│      │  - MPD Parser (DOMParser)      │
│      │  - Segment Downloader          │
│      │  - FFmpeg.wasm Muxer           │
│      └────────────────┘              │
└──────────────────────────────────────┘
```

## Technical Stack

- **Manifest**: V3 (Chrome Extension Manifest 3)
- **Core APIs**: webRequest (observe mode), declarativeNetRequest, Downloads, Storage, Tabs, notifications, sidePanel
- **Video Processing**: FFmpeg.wasm for browser-side muxing/transmuxing
- **Protocols**: HLS (M3U8/TS), DASH (MPD/M4S)
- **Target Browsers**: Chrome/Edge 93+, Firefox, Kiwi Browser (Android)

## Planned Features (V1.0)

### P0 (Must Have)
1. Network request sniffing engine (URL suffix + Content-Type dual detection)
2. M3U8 parsing, TS segment download and merge
3. MPD parsing, segment download and merge (core differentiator)
4. Download management (progress, pause/resume/cancel, download list)
5. Multi-threaded concurrency (default 6 threads, adjustable)
6. Popup operation panel

### P1 (High Priority)
7. AES-128 auto decryption
8. Live stream recording
9. Video preview
10. Download queue and batch management
11. Sidebar mode
12. Format selection (resolution, audio track selection)

### P2 (Planned)
13. Browser-side FFmpeg.wasm transmuxing
14. Mobile browser adaptation
15. Custom download rules (regex, domain whitelist/blacklist)
16. File naming templates
17. Download completion notifications
18. Multi-language UI
19. Developer debug mode

## Development Commands

When the project structure is established, common commands will include:
- `npm install` - Install dependencies
- `npm run build` - Build the extension
- `npm run dev` - Development mode with watch
- `npm test` - Run tests
- `npm run lint` - Lint code

## Permissions Required

The extension will require these Chrome permissions:
- `webRequest` (observe mode only in MV3)
- `declarativeNetRequest`
- `downloads`
- `storage`
- `notifications`
- `tabs`
- `sidePanel`

## Notes

- All operations are performed locally - no data collection
- Compliance: The product is positioned as a non-DRM download tool
- Reference project for architecture: Cat-Catch (猫抓) browser extension

## Gstack

This project uses Gstack for enhanced agent capabilities.

**Web Browsing**: Use `/browse` skill for all web browsing tasks. Do NOT use any `mcp__claude-in-chrome__*` tools.

**Available Skills**:
- `/office hours` - Office hours consultation
- `/plan-ceo-review` - CEO-level plan review
- `/plan-eng-review` - Engineering plan review
- `/plan-design-review` - Design plan review
- `/design-consult` - Design consultation
- `/design-shotgun` - Quick design review
- `/design-html` - HTML design review
- `/review` - Code review
- `/ship` - Ship checklist
- `/land-and-deploy` - Land and deploy
- `/canary` - Canary deployment
- `/benchmark` - Benchmarking
- `/browse` - Web browsing (preferred over mcp tools)
- `/connect-chrome` - Chrome connection
- `/qa` - QA testing
- `/qa-only` - QA only mode
- `/design-review` - Design review
- `/setup-browser-cookies` - Setup browser cookies
- `/setup-deploy` - Setup deployment
- `/setup-gbrain` - Setup gbrain
- `/retro` - Retrospective
- `/investigation` - Investigation
- `/document-release` - Document release
- `/codex` - Codex
- `/cso` - CSO
- `/autoplan` - Auto plan
- `/plan-devex-review` - DevEx plan review
- `/devex-review` - DevEx review
- `/careful` - Careful mode
- `/freeze` - Freeze
- `/guard` - Guard
- `/unfreeze` - Unfreeze
- `/gstack-upgrade` - Gstack upgrade
- `/learn` - Learn
