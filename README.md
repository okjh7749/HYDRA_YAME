# Hydra Territory

Development through a private Web ChatGPT Git writer connection uses isolated
worktrees, chatgpt/* branches, pull requests, required checks, and squash merges.
Direct main pushes are prohibited after the authorized initial bootstrap.

This repository now contains a playable browser milestone for a
StarCraft custom-map-inspired Hydra territory game.

## Multiplayer milestone

- 2–8 player room creation/join flow with short room codes and ready/start states
- StarCraft-style four-force seat mapping: P1/P2, P3/P4, P5/P6 and P7/P8
- authoritative room simulation at 20 Hz; clients send commands, never trusted positions
- per-client snapshots at 10 Hz with live-vision filtering for enemy units and zones
- server-side ownership validation for movement and upgrade commands
- client-specific victory/defeat results and full-vision spectator snapshots after elimination
- teammate-aware disconnect handling; a force is forfeited only after its last client leaves
- dependency-free RFC 6455 WebSocket handshake/frame handling using Node.js standard libraries

## Classic local simulation

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
- local HTTP/WebSocket server implemented with Node.js standard libraries only

## Run locally

### Windows: double-click launcher

The easiest way on Windows is to double-click `실행.bat` in the project root. The launcher:

- verifies that `node` is available
- starts the game server in a separate terminal window from the correct project directory
- waits briefly for startup and opens `http://127.0.0.1:8080` automatically
- leaves the server terminal open so startup errors remain visible

Keep the `Hydra Territory Server` terminal window open while playing. Closing that window stops the
local game server.

### Manual launch

```sh
node src/dev-server.mjs
```

Then open:

- `http://127.0.0.1:8080` for the multiplayer lobby
- `http://127.0.0.1:8080/classic` for the existing local Classic simulation

For a quick multiplayer smoke test, open the root URL in two browser tabs. Create a room in
the first tab, join its room code in the second, mark both players ready, and start from the host tab.

## Automatic deployment from GitHub

The repository includes a `render.yaml` Blueprint for the Node/WebSocket server. After linking this
GitHub repository to Render once, the `main` branch becomes the deployment source and each new commit
merged into `main` automatically triggers a deployment. Production binds to `0.0.0.0`, reads Render's
`PORT`, and exposes `/healthz` for service health checks. Local launches keep the existing
`127.0.0.1:8080` default.

After the one-time Render/GitHub connection, normal development only needs a merge to `main`.

## Multiplayer controls

- left click or drag: select friendly units from the latest server snapshot
- right click: send a movement command for the selected units
- upgrade buttons: send validated attack/defense/range/speed purchase commands

## Classic local controls

- `WASD` / arrow keys: move camera
- move the pointer to the viewport edge: edge scroll
- left click or drag: select friendly units
- right click: move the selected unit or group
- click minimap: center the camera on that world position

## Combat and upgrades

- Hydra kills award 5 minerals and Sunken destruction awards 150 minerals.
- Neutral zones can be captured by an Overlord for 250 minerals when that player commands the strict most Any Unit count and no building occupies the 384x384 zone.
- Click the `HD` building for one-time 100 mineral range/speed upgrades.
- Click the `EV` building for 50 mineral attack/defense levels, capped at +255.
- Defense +161 is the first level where a 40 HP Hydra survives the base 200-damage Sunken hit.

Writer code, credentials, service scripts and check configuration remain outside
this repository.
