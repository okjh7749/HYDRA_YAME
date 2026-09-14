export function renderTeamBoard(container, rows, teamColors, localScope) {
  const playerScoped = rows.some((row) => Number.isInteger(row.slot));
  const signature = `${playerScoped ? 'player' : 'force'}|${rows.map(
    (row) => `${row.slot ?? row.team}:${row.team}:${row.status}:${row.zones}:${row.hydras}:${row.minerals}:${row.kills}`,
  ).join('|')}`;
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.dataset.scope = playerScoped ? 'player-slot' : 'force';
  container.replaceChildren();

  for (const row of rows) {
    const item = document.createElement('div');
    item.className = `team-row ${row.status === 'eliminated' ? 'eliminated' : ''}`;

    const badge = document.createElement('span');
    badge.className = 'team-badge';
    badge.style.background = teamColors[row.team] ?? '#788';
    badge.textContent = playerScoped ? `P${row.slot + 1}` : String(row.team + 1);

    const name = document.createElement('span');
    name.className = 'team-name';
    if (playerScoped) {
      const localTeam = Math.floor(localScope / 2);
      name.textContent = row.slot === localScope
        ? 'YOU'
        : (row.team === localTeam ? 'ALLY' : `AI P${row.slot + 1}`);
    } else {
      name.textContent = row.team === localScope ? 'YOU' : `AI ${row.team + 1}`;
    }

    const territory = document.createElement('span');
    territory.textContent = `Z ${row.zones}`;

    const army = document.createElement('span');
    army.textContent = `H ${row.hydras}`;

    const economy = document.createElement('span');
    economy.textContent = `M ${row.minerals}`;

    const status = document.createElement('span');
    status.className = 'team-status';
    status.textContent = row.status === 'eliminated' ? 'OUT' : `K ${row.kills}`;

    item.append(badge, name, territory, army, economy, status);
    container.append(item);
  }
}

export function renderMatchOverlay(container, match) {
  if (!match) {
    container.hidden = true;
    return;
  }

  let title = '';
  let subtitle = '';
  let mode = '';

  if (match.phase === 'countdown') {
    title = String(Math.max(1, Math.ceil(match.countdownMs / 1000)));
    subtitle = 'BATTLE START';
    mode = 'countdown';
  } else if (match.phase === 'finished') {
    if (match.result === 'victory') title = 'VICTORY';
    else if (match.result === 'draw') title = 'DRAW';
    else title = 'DEFEAT';
    subtitle = match.winnerTeam === null
      ? 'NO SURVIVORS'
      : `FORCE ${match.winnerTeam + 1} WINS · SIMULATION FROZEN`;
    mode = 'finished';
  } else if (match.localMode === 'spectating') {
    title = 'ELIMINATED';
    subtitle = 'SPECTATING · FREE VISION · COMMANDS LOCKED';
    mode = 'spectating';
  } else {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.dataset.mode = mode;
  container.querySelector('.match-overlay-title').textContent = title;
  container.querySelector('.match-overlay-subtitle').textContent = subtitle;
  const actions = container.querySelector('.match-overlay-actions');
  if (actions) actions.hidden = mode === 'countdown';
}
