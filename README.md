# GitHub Tree View — Obsidian Plugin

Browse GitHub repository file trees directly in your Obsidian sidebar with smooth animations, branch switching, and one-click navigation.

## Features

- **Repository tree in sidebar** — visualize any public (or private) GitHub repo as a collapsible file tree
- **Smooth expand/collapse animations** — height-based transitions, no janky `max-height` hacks
- **Branch switching** — switch branches from the sidebar dropdown
- **File filtering** — live search/filter across the tree
- **Context menus** — right-click to open on GitHub, copy path, copy URL, or open raw
- **Multiple repositories** — add as many repos as you want and switch between them
- **File type icons** — smart icons based on file extension (code, image, config, etc.)
- **Dark & light theme support** — uses Obsidian CSS variables throughout
- **Caching** — configurable cache to avoid hitting GitHub rate limits

## Installation

### Community Plugin Browser (recommended)
1. Open Obsidian → Settings → Community Plugins
2. Click **Browse** and search for **GitHub Tree View**
3. Click **Install**, then **Enable**

### Manual
1. Go to [Releases](https://github.com/Brookky/obsidian-github-tree/releases/latest)
2. Download `main.js`, `manifest.json`, and `styles.css`
3. Create `.obsidian/plugins/obsidian-github-tree/` in your vault
4. Place all three files inside
5. Enable in Settings → Community Plugins

## Setup

1. Click the **GitHub icon** in the left ribbon (or run command `Open GitHub Tree View`)
2. Go to **Settings → GitHub Tree View**
3. Add your repositories (owner + name + default branch)
4. Optionally add a [GitHub Personal Access Token](https://github.com/settings/tokens) for private repos or higher rate limits

## GitHub Token

A token is optional for public repos (60 req/hr without, 5000 with).

Required scopes:
- Public repos: `public_repo`
- Private repos: `repo`

Generate one at [github.com/settings/tokens](https://github.com/settings/tokens).

## Usage

| Action | Result |
|---|---|
| Click a file | Open file on GitHub |
| Click a folder | Expand / collapse |
| Right-click file | Copy path, URL, raw URL |
| Right-click folder | Open on GitHub, copy path |
| Branch dropdown | Switch branch |
| Refresh button | Force-reload tree |
| Collapse All button | Collapse entire tree |
| Search box | Filter files by name |

## Development

```bash
git clone https://github.com/Brookky/obsidian-github-tree
cd obsidian-github-tree
npm install
npm run dev   # watch mode
npm run build # production build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## License

MIT
