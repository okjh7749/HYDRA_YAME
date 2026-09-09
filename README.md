# Hydra Territory

Development through a private Web ChatGPT Git writer connection uses isolated
worktrees, chatgpt/* branches, pull requests, required checks, and squash merges.
Direct main pushes are prohibited after the authorized initial bootstrap.

This repository now contains a playable browser milestone for a
StarCraft custom-map-inspired Hydra territory game.

## Current milestone

- 64 x 64 navigation grid (2048 x 2048 world pixels)
- 21 strategic capture zones with four team starting zones
- real unwalkable void terrain and narrow connecting corridors
- camera movement with WASD, arrow keys and edge scrolling
- real-time circular vision from friendly units and owned sunkens
- enemy units and minimap information hidden outside current vision
- every owned sunken produces one Hydra every 0.5 seconds
- classic local production cap of 80 Hydras around each zone
- click/drag unit selection with group formation movement
- one selectable Beacon Zealot per team with eight directional trigger pads
- Beacon triggers rally every friendly Hydra toward the mapped central battle zone
- spatial-hash Hydra separation keeps large groups from stacking or entering void terrain
- three-second match countdown and an in-game elapsed timer
- three deterministic non-local AI teams that expand, assault and capture territory
- live four-team scoreboard for zones, Hydras, minerals, kills and elimination state
- classic defeat rule: a team is eliminated when it has no Hydras and no Sunkens
- last surviving team wins and the match simulation freezes on completion
- local elimination switches to command-locked spectator mode with full battlefield vision
- clickable strategic minimap with a live camera rectangle and unit dots
- controllable Overlord and Hydras with right-click pathfinding
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
- left click or drag: select friendly units
- right click: move the selected unit or group
- click minimap: center the camera on that world position

## Combat and upgrades

- Hydra kills award 5 minerals and Sunken destruction awards 200 minerals.
- Neutral zones can be captured by an Overlord for 250 minerals with a strict Hydra lead.
- Click the `HD` building for one-time 100 mineral range/speed upgrades.
- Click the `EV` building for 50 mineral attack/defense levels, capped at +255.
- Defense +161 is the first level where a 40 HP Hydra survives the base 200-damage Sunken hit.

Writer code, credentials, service scripts and check configuration remain outside
this repository.
