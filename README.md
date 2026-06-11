# ALARM STATE — Prairie Gold Processing

A 3D first-person industrial troubleshooting game. You are the on-shift I&C technician at
**Prairie Gold Processing Plant 7**, a soybean oil extraction & refining plant in Maple Junction, Iowa.
Alarms come in, the radio lights up with operators (some helpful, some hostile, some flat-out wrong),
and you have to find the **root-cause I/O point** before the plant shuts down.

## Play

No build step. From the repo root:

```bash
python3 -m http.server 8080
# or: npx serve
```

Open <http://localhost:8080>, pick a shift, click **CLOCK IN**, then click the screen to capture the mouse.
WebGL and audio required (Chrome/Edge/Firefox/Safari, desktop).

## How it works

- **Alarm tiers** — every fault escalates: ⚠ WARNING (2 min) → 🔴 CRITICAL (2 min) → ⬛ PLANT SHUTDOWN
  (2 more minutes to identify the cause for partial credit). A shutdown is a strike; three strikes ends the shift.
- **Win condition** — type the tagname of the failing I/O point (e.g. `TCV-2208`) into the
  **SOLVE PROBLEM** box (ENTER key, always available).
- **HMIs** — FactoryTalk View–style operator screens at control-room consoles and field panels (walk up, press E).
  Live process values, equipment animation, alarm banner/summary, and 10-minute trends.
  Screens auto-navigate to the subject of the active alarm.
- **Development node** — the engineering workstation in the control room opens a Logix-style ladder viewer,
  pre-navigated to the routine that generated the alarm, with live values, energized-rung highlighting,
  and click-to-cross-reference on every tag.
- **Radio (R)** — key up and question the control room, field operators, maintenance, or the supervisor.
  Expect attitude. On harder shifts, expect lies.
- **The plant is a clue** — steam plumes, hissing actuators, silent pump pads, freewheeling fans,
  flashing area beacons, and alarm horns all point somewhere.

## Modes

| Shift | Difficulty | Crew |
|---|---|---|
| Day | Easy | Helpful, truthful, clear clues |
| Swing | Normal | Some misleading chatter, supervisor is mean |
| Graveyard | Hard | Skeleton crew, designated liars, maximum attitude, 2× points |

10 fault scenarios across Bean Prep, Extraction/DT, Refinery, Utilities, and Meal — stuck valves,
failed positioners, lying level switches, tripped overloads, sheared shear pins, failed transmitters,
seal failures with hexane LEL alarms, and more. Scoring rewards solving in the warning tier, with
streak bonuses and per-difficulty high scores (localStorage).

## Controls

`WASD` move · `SHIFT` run · `E` interact (HMI / engineering workstation) · `R` radio ·
`ENTER` solve problem · `M` plot plan · `ESC` pause

## Tech

Plain ES modules + [Three.js](https://threejs.org/) (vendored in `vendor/`, no network needed).
Synthesized audio (WebAudio) for horns/ambience/steam; optional speech-synthesis radio voices
(toggle in pause menu).

```
js/main.js            bootstrap, loop, overlays, HUD
js/game.js            round state machine, tiers, scoring
js/world.js           3D plant
js/sim.js             live process simulation + fault overrides
js/hmi.js             FactoryTalk-style screens
js/ladder.js          Logix-style ladder viewer
js/radio.js           radio Q&A
js/effects.js         steam/leaks/beacons
js/audio.js           synthesized sound
js/data/tags.js       plant tag database
js/data/scenarios.js  fault scenarios, NPC roster, radio scripts
```
