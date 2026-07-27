# ALARMSTATE: PLANT 7

AlarmState is a first-person automation apprenticeship set inside one operating soybean extraction and refining plant. You are T. Ryder, a newly hired controls technician. Plant 7 failed an alarm-management audit because its operators stopped trusting the controls. Your job is to rebuild that trust, earn field authorization, and keep the site online through corporate acceptance.

The course and the plant are one game. There is no separate free-shift mode.

## Campaign loop

1. Report to Frank at the Reliability Center dispatch desk.
2. Accept the next unlocked assignment.
3. Follow the amber world marker and plot-plan route to the equipment or ESCO workstation.
4. Program, inspect, or troubleshoot using the embedded ESCO Automation Studio and the live Plant 7 simulation.
5. Prove the result and return to dispatch for debrief.

Progress is saved in the browser. The qualification log records 21 assignments across 12 weeks, but progression happens physically inside the same persistent plant.

## Qualification arc

- Weeks 1-4 commission CV-101, condition PE-101, create safe drive logic, and build the operator HMI in ESCO.
- Weeks 5-9 move into live Prep, Extraction, Refinery, Utilities, and Meal fault calls.
- Weeks 10-12 run multi-area diagnostic shifts, the graveyard gauntlet, and final Plant 7 acceptance.
- Every programming assignment is checked against the learner's real ESCO project. The game provides context and one conceptual hint, never a completed rung or HMI answer.
- Passing an ESCO gate archives that project, clears the ladder workspace for the next assignment, and adds the accepted work to the review-only ESCO Course Portfolio in the Qualification Log.

## The Plant 7 controller

Plant 7 runs one real controller program, `PGP_Plant7_PLC`, authored once in
`js/data/plant-logic.js`: five programs, sixteen routines, ~150 rungs. It does
not change when the incident changes — a controller runs the same code whether
the plant is healthy or on fire, and only the process values move.

Nothing in it is scripted. There is no "this contact is true" flag anywhere.
`js/plc.js` scans the ladder every frame against the process simulation with
Logix semantics — series AND, parallel OR, output instructions passing rung
condition through, timers accumulating toward `.DN`, latches retained across
scans — and every alarm bit, interlock, and motor command in the game is the
result. A healthy plant raises no alarms because the logic says so, not because
a flag says so.

The logic is held to the standards a controls engineer would apply at a review:

- A coil never writes a wired field input. Run feedback is compared, not driven.
- A timer never shares a rung with the output it delays; the delayed output is
  driven from `XIC(timer.DN)` on its own rung.
- Motor starters are 3-wire: a start/seal-in parallel branch, then the stop
  button and every interlock in series ahead of the coil.
- Valve deviation is computed with real math boxes (`SUB` then `ABS`, then a
  comparison) because a controller has no "deviation instruction".
- Exactly one `OTE` per BOOL across the controller — no double coils.
- Every latched trip has a reset rung that also proves the cause has cleared.
- Every routine is reached by a `JSR` from its program's `MainRoutine`.
- `PID` is present and never executed. Closed-loop control has no faithful
  offline algorithm, so the loops are declared model-only and the control valves
  are moved by the process simulation instead of a faked controller.

The operator alarm database is derived from the coils in the ladder rather than
maintained as a second list, so it cannot drift away from the logic.

`tests/plc.test.mjs` enforces all of the above, and proves it can: it runs the
same audit against nine deliberately broken copies of the controller (a double
coil, a coil on an input, an output after its timer, an unreachable subroutine,
an empty branch leg, a latch with no reset, and so on) and requires every one to
be rejected. It then scans each of the ten incidents and asserts the alarm — and
the supporting evidence the debrief promises — is produced from live values.

The generated project also passes ESCO Automation Studio's own verification with
zero errors and zero warnings; the studio's status bar reads
`Verification Passed (0 Errors)` when a routine is open.

## Plant 7

The procedural Three.js site includes the original CV-101 conveyor and process map plus:

- Reliability Center, dispatch, HMI design studio, and covered conveyor training bay
- Grain receiving pits, bucket elevator, storage silos, and enclosed transfer galleries
- Bean Prep, Extraction/DT, Refinery, Utilities, Meal, and central control
- Maintenance and instrument shop, MCC annex, packaging warehouse, and truck docks
- Electrical substation, rail spur, gatehouse, parking, roads, pipe racks, and site lighting

## Run locally

```powershell
cd C:\Users\nmodha\AlarmState
npm.cmd run start:local
```

Open [http://127.0.0.1:5190/](http://127.0.0.1:5190/).

## Crew Response multiplayer

Crew Response is a server-authoritative LAN co-op shift for two to four players. One player creates a five-character room, assigns the crew, and deploys the team into the same live incident. The server owns the alarm clock, tier escalation, strikes, score, answer validation, and reconnect tokens.

- Controls Technician uses ESCO Logic and submits the final I/O cause.
- Control Room Operator uses the prebuilt ESCO HMI, alarms, and trends.
- Field Operator reaches the affected equipment and reports physical evidence.
- Maintenance Lead uses ESCO diagnostics and maintenance evidence.

Start the multiplayer server on the host PC:

```powershell
cd C:\Users\nmodha\AlarmState
npm.cmd run start:multi
```

Open [http://127.0.0.1:5191/](http://127.0.0.1:5191/) on the host. Other computers on the same network open `http://HOST-PC-IP:5191/`, select **Crew Response**, and join with the room code or copied invite link. A disconnected player has 60 seconds to reclaim the same callsign and role.

## Controls

`WASD` move | `Shift` run | `E` interact | `M` plot plan | `R` radio | `H` live ESCO HMI | `Tab` live ESCO logic | `Enter` submit root-cause tag | `Esc` pause

## Validation

```powershell
npm.cmd run check
```

The check covers JavaScript syntax, all 12 weeks and 21 assignments, physical mission destinations, scenario references, ESCO ladder/HMI validators, campaign routing, Plant 7 project generation, multiplayer permissions, shared scoring, and reconnect recovery. It also runs the controller conformance suite (`npm.cmd run test:plc`), which audits the plant's ladder against ladder-logic standards, verifies that audit rejects nine injected defects, and scans all ten incidents to confirm each alarm is solved rather than authored.

With the multiplayer server running:

- `npm.cmd run test:browser` performs a two-client desktop gameplay pass.
- `npm.cmd run test:plant7-ladder` opens the real Plant 7 controller in the
  embedded studio and checks that it renders as ladder — seal-in branches drawn
  as parallel branches, no empty branch legs, terminal coils on the right rail,
  and the live tag image accepted over the same channel the game uses.

Both write QA screenshots under `tests/artifacts/`.

## Main files

```text
js/main.js            browser/game bootstrap and UI wiring
js/campaign.js        continuous apprenticeship and physical routing
js/course.js          12-week story and assignment data
js/world.js           full procedural Plant 7 world
js/game.js            alarm call state machine, tiers, scoring, and debriefs
js/esco.js            ESCO workspace integration and practical validation
js/data/plant-logic.js  the real PGP_Plant7_PLC ladder: 5 programs, 16 routines
js/plc.js             ladder scan engine that solves it against the simulation
js/plant7-esco.js     the same controller emitted as an ESCO studio project
js/multiplayer.js     lobby, room client, role workflows, and remote avatars
server/rooms.mjs      authoritative rooms, incidents, permissions, and scoring
server/multiplayer-server.mjs  HTTP/WebSocket LAN host
js/data/scenarios.js  ten production fault scenarios and radio evidence
                      (process behaviour and story only — never ladder logic)
```
