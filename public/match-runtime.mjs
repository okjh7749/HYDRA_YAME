import '/public/game-v3.mjs';
import { initializeAiState, stepAi } from '/src/game-ai.mjs';
import {
  evaluateMatchState,
  formatMatchTime,
  initializeMatchState,
  matchTeamRows,
  stepMatchClock,
} from '/src/game-match.mjs';
import { renderMatchOverlay, renderTeamBoard } from '/public/match-ui.mjs';

const runtime = window.__hydraGame;
if (!runtime) throw new Error('Hydra game runtime was not initialized');

const { map, simulation, selectedIds } = runtime;
const LOCAL_TEAM = simulation.localTeam;
const teamColors = ['#53e3b2', '#f0bc4a', '#e55a55', '#6da9ff'];
const gameCanvas = document.querySelector('#game');
const upgradePanel = document.querySelector('#upgradePanel');
const timerNode = document.querySelector('#matchTimer');
const teamBoard = document.querySelector('#teamBoard');
const matchOverlay = document.querySelector('#matchOverlay');

initializeMatchState(simulation, map, { countdownMs: 3000 });
initializeAiState(simulation);

function commandsLocked() {
  return simulation.match.phase !== 'running' || simulation.match.localMode !== 'playing';
}

function blocksGameCommand(event) {
  if (!commandsLocked()) return false;
  if (event.target === gameCanvas) return true;
  return Boolean(upgradePanel?.contains(event.target));
}

for (const eventName of ['pointerdown', 'pointerup', 'contextmenu', 'click']) {
  window.addEventListener(eventName, (event) => {
    if (!blocksGameCommand(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}

function cleanupEliminatedArtifacts() {
  const eliminated = new Set(
    simulation.players
      .filter((player) => player.status === 'eliminated')
      .map((player) => player.team),
  );
  if (simulation.match.phase === 'finished') {
    for (const unit of simulation.units) {
      if (unit.type === 'overlord' && unit.team === LOCAL_TEAM) unit.hp = 0;
    }
  }
  simulation.units = simulation.units.filter(
    (unit) => unit.hp > 0 && !eliminated.has(unit.team),
  );
  for (const building of simulation.upgradeBuildings ?? []) {
    if (eliminated.has(building.team)) building.hp = 0;
  }
  if (simulation.match.localMode === 'spectating') selectedIds.clear();
}

function updateMatchUi() {
  timerNode.textContent = formatMatchTime(simulation.match.elapsedMs);
  renderTeamBoard(teamBoard, matchTeamRows(simulation, map), teamColors, LOCAL_TEAM);
  renderMatchOverlay(matchOverlay, simulation.match);
}

let lastFrame = performance.now();

function matchFrame(now) {
  const deltaMs = Math.min(50, Math.max(0, now - lastFrame));
  lastFrame = now;

  const clockEvents = stepMatchClock(simulation, map, deltaMs);
  if (clockEvents.some((event) => event.type === 'match-start')) {
    selectedIds.clear();
  }

  if (simulation.match.phase === 'running') {
    stepAi(simulation, map, deltaMs);
    evaluateMatchState(simulation, map);
  }

  cleanupEliminatedArtifacts();
  updateMatchUi();
  requestAnimationFrame(matchFrame);
}

updateMatchUi();
requestAnimationFrame(matchFrame);
