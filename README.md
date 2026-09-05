# Scoreboard Scripting

I looed around and couldn't find a easy to use and smart looking score board to stream into OBS for streaming basketball games. Therefore I made one. The elements that are made on the end points and be overlayed bu HTML into OBS, and then easily controlled from a laptop (full controls) or a mobile by just using the web controls (sub-set of the controls). I use a camera to stream it then a cold shoe phone mount to control the stream elements. 

The FIBA stats are currently a work in progress and don't currently work. I am also looking into integration of Basketball Englands Play HQ, both for live stats and live score/scoreboard. 

A browser-based basketball scoreboard for Portsmouth Force. The control panel updates the main display and overlay pages in real time using Socket.IO.

## Not Working
- Logos
- FIBA integration

## Features

- Live home and away scores with one-point undo controls.
- FIBA-style game clock, quarter controls, fouls, bonus indicators, and timeouts.
- Configurable team names, colours, logos, fonts, and player line-ups.
- Saved team profiles in `teams.json`, manageable from the control panel.
- Transparent tip-off, line-up, and foul announcement overlays for production use.
- FIBA Live Stats preview with a shot map, team statistics, and player statistics.
- Browser-based control panel with no database or build step required.

## Requirements

- Node.js 18 or newer, including npm.

## Start Locally

### Direct npm commands

```powershell
npm ci
npm start
```

The default port is `3000`. Set `PORT` to use another port:

```powershell
$env:PORT = 3001
python start.py
```

Stop the server with `Ctrl+C`.

## Endpoints

All pages are served from `public/` by the Express static-file server.

| URL | Purpose |
| --- | --- |
| `/` | Main scoreboard display |
| `/control.html` | Live operator control panel |
| `/team-entry.html` | Create and edit saved teams and numbered players |
| `/tipoff.html` | Transparent pre-game countdown overlay |
| `/lineup.html` | Line-up overlay; use `?team=home`, `?team=away`, or `?pregame=1` |
| `/foul.html` | Foul announcement overlay |
| `/stats.html` | FIBA Live Stats preview viewer |
| `/api/teams` | List, save, and delete saved team profiles |
| `POST /api/fiba` | Broadcast a JSON stats payload to connected stats viewers |

## Example Stream

![alt text](<Team Entry.png>) ![alt text](Mobile_Control.png) ![alt text](Control_Laptop.png) ![alt text](<Both Line-ups.png>) ![alt text](Lineup.png) ![alt text](Scoreboard.png) ![alt text](<End Of.png>) ![alt text](<Time to Tip.png>)