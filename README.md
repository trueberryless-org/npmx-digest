# 📰 npmx-digest

> [!IMPORTANT]  
> Because [GitHub Models were retired](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/), this website does not continue to generate new entries. It will be archived and kept to remember the rapid contributor grow and awesome feature drops of npmx.

[![Built with Astro](https://astro.badg.es/v2/built-with-astro/tiny.svg)](https://astro.build)
[![Netlify Status](https://api.netlify.com/api/v1/badges/765292dd-a66b-423b-aece-551ab6940f24/deploy-status)](https://app.netlify.com/projects/npmx-digest/deploys)

An automated news aggregation website that summarizes [**npmx**](https://repo.npmx.dev) activity from GitHub and Bluesky every 8 hours.

## ⚡ Report Cycle

The system generates reports three times daily:

* **Daily** (`07:00 CET`) – Morning snapshot.
* **Midday** (`15:00 CET`) – Progress update.
* **Nightly** (`23:00 CET`) – Day end post-mortem.

## ✨ Features

- 🤖 **AI-Powered Summaries** — Leverages **GitHub Models** to cluster technical signals into intelligent topics.
- 🦋 **Social-First Insights** — Prioritizes **Bluesky** community interactions as high-signal anchors for technical digests.
- ⏰ **Thrice Daily Updates** — Automated digests generated at 06:00, 14:00, and 22:00 UTC to cover global activity.
- 🛠️ **Best-in-Class Tooling** — Built with **Astro 5**, **TypeScript**, and **pnpm** for a type-safe, high-performance workflow.
- 🔄 **Fully Automated** — GitHub Actions manages the end-to-end lifecycle: fetching events, AI processing, and git-backed persistence.
- 📱 **Minimalist & Responsive** — A clean, modern interface designed for readability across all device types.
