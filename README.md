# 📰 npmx-digest

An automated news aggregation website that summarizes npmx activity from GitHub and Bluesky every 12 hours.

## ✨ Features

- 🤖 **AI-Powered Summaries** - Uses GitHub Models to generate concise summaries
- ⏰ **Twice Daily Updates** - Posts published at 07:00 and 23:00 CET
- 🎨 **Beautiful Minimalist Design** - Clean, modern interface with no framework dependencies
- 📱 **Fully Responsive** - Works perfectly on all devices
- 🔄 **Automated** - GitHub Actions handles everything automatically

## 🚀 Quick Start

### Prerequisites

- Node.js 24+ installed
- GitHub account
- (Optional) Bluesky account for Bluesky integration

### Installation

1. **Clone and install dependencies:**

```bash
cd npmx-digest
pnpm install
```

2. **Set up environment variables:**

Create a `.env` file in the root directory:

```env
# Required for AI summaries and GitHub API
GITHUB_TOKEN=your_github_token_here
```

3. **Run development server:**

```bash
pnpm dev
```

Visit `http://localhost:4321` to see your site!

## 🛠️ Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
| `pnpm generate` | Manually generate a new post |

## 📝 Manual Post Generation

To create a post manually:

```bash
pnpm generate
```

This will:
1. Fetch events from GitHub and Bluesky from the last 12 hours
2. Generate an AI summary using GitHub Models
3. Create a JSON file in `src/content/posts/`
4. Automatically determine if it's a "daily" or "nightly" post based on current time

## ⚙️ GitHub Actions Setup

The site automatically generates posts using GitHub Actions. To set this up:

1. **Enable GitHub Actions** in your repository settings

2. **Add repository secrets:**
   - Go to Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `GITHUB_TOKEN` (automatically provided by GitHub)

3. **Enable GitHub Pages (optional):**
   - Go to Settings → Pages
   - Source: GitHub Actions
   - Your site will be deployed automatically after each post generation

The workflow runs automatically at:
- **07:00 CET** (daily post)
- **23:00 CET** (nightly post)

You can also trigger it manually from the Actions tab.

## 🔑 Getting Tokens

### GitHub Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Copy and save the token

### Bluesky

No authentication needed! The public API is used to fetch posts.

## 🎨 Customization

### Styling

All styles are inline CSS using CSS custom properties. To customize colors, edit the `:root` variables in `src/layouts/Layout.astro`:

```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #151515;
  --accent: #3b82f6;
  /* ... more variables ... */
}
```

### Post Schedule

To change when posts are generated, edit `.github/workflows/generate-post.yml`:

```yaml
schedule:
  - cron: '0 6 * * *'   # 07:00 CET (daily)
  - cron: '0 22 * * *'  # 23:00 CET (nightly)
```

### Sources

To add or modify data sources, edit `src/lib/utils.ts` and add new fetch functions.

## 🐛 Troubleshooting

**Posts not generating:**
- Check GitHub Actions logs in the Actions tab
- Verify environment variables are set correctly
- Ensure GitHub token has necessary permissions

**No events showing:**
- Verify the GitHub repository exists and is accessible
- Ensure Bluesky handle is correct

**Build fails:**
- Run `npm run build` locally to see errors
- Check that all dependencies are installed
- Verify Node.js version is 18+

## 📄 License

MIT License - feel free to use this for your own projects!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 💡 Tips

- The first time you run the site, there will be no posts. Run `npm run generate` to create one.
- Posts are stored as JSON files in `src/content/posts/` - you can manually edit them if needed.
- The AI summary quality depends on the events found. More events = better summaries!
- GitHub Models uses the `gpt-4o-mini` model by default for cost efficiency.

---

Built with [Astro](https://astro.build) 🚀
