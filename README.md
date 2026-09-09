# Hydra Territory

Development through a private Web ChatGPT Git writer connection uses isolated
worktrees, chatgpt/* branches, pull requests, required checks, and squash merges.
Direct main pushes are prohibited after the authorized initial bootstrap.

This repository now contains the first playable browser milestone for a
StarCraft custom-map-inspired Hydra territory game.

## Current milestone

- 64 x 64 navigation grid (2048 x 2048 world pixels)
- 21 strategic capture zones with four team starting zones
- real unwalkable void terrain and narrow connecting corridors
- camera movement with WASD, arrow keys and edge scrolling
- clickable strategic minimap with a live camera rectangle
- controllable Overlord prototype with right-click pathfinding
- invalid movement targets snap to the nearest valid tile
- local static server implemented with Node.js standard library only

## Run locally

```sh
node src/dev-server.mjs
```

Then open `http://127.0.0.1:8080`.

## Controls

- `WASD` / arrow keys: move camera
- move the pointer to the viewport edge: edge scroll
- right click: move the selected Overlord prototype
- click minimap: center the camera on that world position

Writer code, credentials, service scripts and check configuration remain outside
this repository.
