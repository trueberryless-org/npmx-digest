# 📰 npmx-digest

[![Built with Astro](https://img.shields.io/badge/built%20with-Astro-ff5d01.svg)](https://astro.build)

An automated news aggregation website that summarizes [**npmx**](https://repo.npmx.dev) activity from GitHub and Bluesky every 12 hours.

## ⚡ Report Cycle

The system generates reports three times daily:

* **Daily** (`07:00 CET`) – Morning snapshot.
* **Midday** (`15:00 CET`) – Progress update.
* **Nightly** (`23:00 CET`) – Day end post-mortem.

## ✨ Features

- 🤖 **AI-Powered Summaries** - Uses GitHub Models to generate concise summaries
- ⏰ **Twice Daily Updates** - Posts published at 07:00 and 23:00 CET
- 🎨 **Beautiful Minimalist Design** - Clean, modern interface with no framework dependencies
- 📱 **Fully Responsive** - Works perfectly on all devices
- 🔄 **Automated** - GitHub Actions handles everything automatically
