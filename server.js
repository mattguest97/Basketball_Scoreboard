const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const teamsFile = path.join(__dirname, 'teams.json');

function readTeams() {
  try {
    const data = JSON.parse(fs.readFileSync(teamsFile, 'utf8'));
    return Array.isArray(data.teams) ? data.teams : [];
  } catch (error) {
    return [];
  }
}

function writeTeams(teams) {
  fs.writeFileSync(teamsFile, JSON.stringify({ teams }, null, 2) + '\n', 'utf8');
}

function teamIdFor(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

function normaliseTeam(team) {
  const name = String(team.name || '').trim().slice(0, 80);
  const color = String(team.color || '').trim();
  const logo = typeof team.logo === 'string' ? team.logo.slice(0, 700000) : '';
  const players = Array.isArray(team.players) ? team.players.slice(0, 15).map((player) => ({
    number: String(player.number || '').trim().slice(0, 5),
    name: String(player.name || '').trim().slice(0, 80),
    points: Math.max(0, Number(player.points) || 0),
    fouls: Math.max(0, Number(player.fouls) || 0)
  })).filter((player) => player.number || player.name) : [];
  if (!name || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  return { id: String(team.id || ''), name, color, logo, players };
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

app.get('/api/teams', (req, res) => {
  res.json({ teams: readTeams() });
});

app.post('/api/teams', (req, res) => {
  const incoming = normaliseTeam(req.body || {});
  if (!incoming) return res.status(400).json({ ok: false, error: 'Team name and a six-digit hex color are required.' });

  const teams = readTeams();
  const existingIndex = incoming.id ? teams.findIndex((team) => team.id === incoming.id) : -1;
  if (existingIndex >= 0) {
    teams[existingIndex] = incoming;
  } else {
    const baseId = teamIdFor(incoming.name);
    let id = baseId;
    let suffix = 2;
    while (teams.some((team) => team.id === id)) id = `${baseId}-${suffix++}`;
    incoming.id = id;
    teams.push(incoming);
  }
  writeTeams(teams);
  res.json({ ok: true, team: incoming, teams });
});

app.delete('/api/teams/:id', (req, res) => {
  const teams = readTeams();
  const filtered = teams.filter((team) => team.id !== req.params.id);
  if (filtered.length === teams.length) return res.status(404).json({ ok: false, error: 'Team not found.' });
  writeTeams(filtered);
  res.json({ ok: true, teams: filtered });
});

// Simple relay endpoint for FIBA Live Stats or other live feeds.
// POST JSON payloads to /api/fiba and they will be broadcast to connected clients as 'fibaUpdate'.
app.post('/api/fiba', (req, res) => {
  const payload = req.body || {};
  // Optionally validate or transform payload here.
  io.emit('fibaUpdate', payload);
  res.json({ ok: true });
});

// initial game state
let state = {
  home: {
    name: 'Home',
    logo: '',
    color: '#0052cc',
    score: 0,
    fouls: 0,
    timeoutsRemaining: 2,
    lineup: []
  },
  away: {
    name: 'Away',
    logo: '',
    color: '#cc0000',
    score: 0,
    fouls: 0,
    timeoutsRemaining: 2,
    lineup: []
  },
  quarter: 1,
  periodLengthsSec: 600, // default 10 minutes
  clock: 600,
  running: false,
  tipoffSeconds: 1800,
  tipoffRunning: false,
  tipoffTitle: 'Time to Tip Off',
  fontFamily: 'Arial, sans-serif',
  bonus: { home: false, away: false }
};

let clockTimer = null;

function updateBonusFlags() {
  state.bonus.home = state.home.fouls >= 5;
  state.bonus.away = state.away.fouls >= 5;
}

function tick() {
  let changed = false;
  if (state.running && state.clock > 0) {
    state.clock -= 1;
    changed = true;
  }
  if (state.running && state.clock <= 0) {
    state.running = false;
    changed = true;
  }
  if (state.tipoffRunning && state.tipoffSeconds > 0) {
    state.tipoffSeconds -= 1;
    changed = true;
  }
  if (state.tipoffRunning && state.tipoffSeconds <= 0) {
    state.tipoffRunning = false;
    changed = true;
  }
  if (changed) io.emit('state', state);
}

io.on('connection', (socket) => {
  socket.emit('state', state);

  socket.on('control', (patch) => {
    // apply allowed patches from control panel
    const p = patch || {};
    if (p.home) Object.assign(state.home, p.home);
    if (p.away) Object.assign(state.away, p.away);
    for (const team of ['home', 'away']) {
      if (p.lineup && Array.isArray(p.lineup[team])) {
        state[team].lineup = p.lineup[team].slice(0, 15).map((player) => ({
          number: String(player.number || ''),
          name: String(player.name || ''),
          points: Math.max(0, Number(player.points) || 0),
          fouls: Math.max(0, Number(player.fouls) || 0)
        })).filter((player) => player.name || player.number);
      }
    }
    if (typeof p.quarter === 'number') state.quarter = p.quarter;
    if (typeof p.clock === 'number') state.clock = p.clock;
    if (typeof p.running === 'boolean') state.running = p.running;
    if (p.fontFamily) state.fontFamily = p.fontFamily;
    if (typeof p.periodLengthsSec === 'number') state.periodLengthsSec = p.periodLengthsSec;

    // enforce FIBA timeouts per half: first half quarters 1-2 -> 2 each, second half 3-4 -> 3 each when quarter increments to 3
    if (p.resetForQuarter) {
      if (state.quarter === 3) {
        state.home.timeoutsRemaining = 3;
        state.away.timeoutsRemaining = 3;
      }
      if (state.quarter <= 2) {
        state.home.timeoutsRemaining = 2;
        state.away.timeoutsRemaining = 2;
      }
    }

    updateBonusFlags();
    io.emit('state', state);
  });

  socket.on('increment', ({ team, points }) => {
    if (!['home','away'].includes(team)) return;
    const pts = Number(points) || 0;
    state[team].score += pts;
    // emit a short-lived delta event so displays can animate point pickups
    io.emit('scoreDelta', { team, points: pts });
    io.emit('state', state);
  });

  socket.on('foul', ({ team, delta }) => {
    if (!['home','away'].includes(team)) return;
    state[team].fouls = Math.max(0, state[team].fouls + Number(delta));
    updateBonusFlags();
    io.emit('state', state);
  });

  socket.on('timeout', ({ team }) => {
    if (!['home','away'].includes(team)) return;
    if (state[team].timeoutsRemaining > 0) {
      state[team].timeoutsRemaining -= 1;
      io.emit('state', state);
    }
  });

  socket.on('clock', ({ action, value }) => {
    if (action === 'start') {
      if (!clockTimer) clockTimer = setInterval(tick, 1000);
      state.running = true;
    } else if (action === 'pause') {
      state.running = false;
    } else if (action === 'set') {
      state.clock = Number(value) || state.clock;
    } else if (action === 'reset') {
      state.clock = state.periodLengthsSec;
      state.running = false;
    }
    io.emit('state', state);
  });

  socket.on('tipoff', ({ action, value, title }) => {
    const allowedTitles = ['Time to Tip Off', 'End of Q1', 'HT', 'End of Qt3', 'FT'];
    if (action === 'start' && state.tipoffSeconds > 0) {
      if (allowedTitles.includes(title)) state.tipoffTitle = title;
      if (!clockTimer) clockTimer = setInterval(tick, 1000);
      state.tipoffRunning = true;
    } else if (action === 'pause') {
      state.tipoffRunning = false;
    } else if (action === 'set') {
      state.tipoffSeconds = Math.max(0, Number(value) || 0);
    } else if (action === 'title') {
      if (allowedTitles.includes(value)) state.tipoffTitle = value;
    } else if (action === 'reset') {
      state.tipoffSeconds = 1800;
      state.tipoffRunning = false;
      state.tipoffTitle = 'Time to Tip Off';
    }
    io.emit('state', state);
  });

  socket.on('setQuarter', ({ quarter }) => {
    state.quarter = Number(quarter) || state.quarter;
    // apply FIBA timeout reset when entering second half
    if (state.quarter === 3) {
      state.home.timeoutsRemaining = 3;
      state.away.timeoutsRemaining = 3;
    }
    io.emit('state', state);
  });

  socket.on('reset', () => {
    state.home.score = 0;
    state.away.score = 0;
    state.home.fouls = 0;
    state.away.fouls = 0;
    state.home.lineup.forEach((player) => { player.points = 0; });
    state.away.lineup.forEach((player) => { player.points = 0; });
    state.home.lineup.forEach((player) => { player.fouls = 0; });
    state.away.lineup.forEach((player) => { player.fouls = 0; });
    state.home.timeoutsRemaining = 2;
    state.away.timeoutsRemaining = 2;
    state.quarter = 1;
    state.clock = state.periodLengthsSec;
    state.running = false;
    state.tipoffSeconds = 1800;
    state.tipoffRunning = false;
    state.tipoffTitle = 'Time to Tip Off';
    updateBonusFlags();
    io.emit('state', state);
  });

  socket.on('announceFoul', (payload) => {
    // payload: { team: 'home'|'away', playerNumber: '23', type: 'Personal', duration: 5 }
    io.emit('announceFoul', payload);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
