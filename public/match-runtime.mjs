import { initializeAiState, stepAi } from '/src/game-ai.mjs';
import {
  evaluateMatchState,
  formatMatchTime,
  initializeMatchState,
  matchPlayerRows,
  stepMatchClock,
} from '/src/game-match.mjs';
import { unitOwnerSlot } from '/src/game-ownership.mjs';
import { renderMatchOverlay, renderTeamBoard } from '/public/match-ui.mjs';
import { setTextIfChanged } from '/src/rts-client-shared.mjs';

export function createClassicMatchRuntime({
  map,
  simulation,
  selectedIds,
  timerNode,
  teamBoard,
  matchOverlay,
  teamColors,
}) {
  initializeMatchState(simulation, map, { countdownMs: 3000 });
  initializeAiState(simulation);

  function commandsLocked() {
    return simulation.match.phase !== 'running' || simulation.match.localMode !== 'playing';
  }

  function cleanupEliminatedArtifacts() {
    const eliminated = new Set(
      simulation.players
        .filter((player) => player.status === 'eliminated')
        .map((player) => player.slot),
    );
    simulation.units = simulation.units.filter(
      (unit) => unit.hp > 0 && !eliminated.has(unitOwnerSlot(unit)),
    );
    for (const building of simulation.upgradeBuildings ?? []) {
      if (eliminated.has(building.ownerSlot)) building.hp = 0;
    }
    if (simulation.match.localMode === 'spectating') selectedIds.clear();
  }

  function renderUi() {
    setTextIfChanged(timerNode, formatMatchTime(simulation.match.elapsedMs));
    renderTeamBoard(
      teamBoard,
      matchPlayerRows(simulation, map),
      teamColors,
      simulation.localPlayerSlot,
    );
    renderMatchOverlay(matchOverlay, simulation.match);
  }

  function step(deltaMs) {
    const events = stepMatchClock(simulation, map, deltaMs);
    if (simulation.match.phase === 'running') {
      stepAi(simulation, map, deltaMs);
      evaluateMatchState(simulation, map);
    }
    cleanupEliminatedArtifacts();
    renderUi();
    return events;
  }

  renderUi();
  return { commandsLocked, renderUi, step };
}
