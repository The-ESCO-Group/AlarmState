# AlarmState Full Course Answer Key

This key matches the course and acceptance validators currently implemented in
`js/course.js`, `js/esco.js`, and `js/data/scenarios.js`.

## Ladder notation

- `XIC Tag` is true when `Tag = 1`.
- `XIO Tag` is true when `Tag = 0`.
- `OTE Tag` is a normal, non-retentive output.
- `OTL Tag` latches a bit; `OTU Tag` unlatches it.
- Timer presets are milliseconds.
- A `CTU` preset is a count, not milliseconds. A CTU increments on a
  false-to-true transition of its rung.
- `[A OR B]` means put `A` and `B` on parallel branches.

The ESCO workspace clears accepted rung instructions before the next assignment.
Build the listed logic for each assignment as its own solution. Accepted work is
preserved in the course portfolio.

## Week 1 - Control Foundations

### 1. Prove the RUN indication

Required tags: `Motor_Run` and `Stack_Green`.

```text
Rung 0
--[XIC Motor_Run]--------------------------------(OTE Stack_Green)--
```

Expected behavior:

- `Motor_Run = 1` energizes the green lamp.
- `Motor_Run = 0` turns the green lamp off.
- Do not use `Start_PB` as the lamp condition. The lamp must show actual
  controller run state, not a momentary request.

### 2. Commission safe start and stop

Use a seal-in branch around `Start_PB`. `Stop_PB` is a normally open physical
button represented by an `XIO`, so pressing it makes the tag true and opens the
logical contact.

```text
Rung 0
--[XIO Stop_PB]--[XIC EStop_OK]--+--[XIC Start_PB]---+--(OTE Motor_Run)--
                                 |                   |
                                 +--[XIC Motor_Run]--+
```

The `Motor_Run` contact must be parallel with `Start_PB`, not parallel with
`Stop_PB` or `EStop_OK`.

Expected sequence:

1. `EStop_OK = 1`, `Stop_PB = 0`.
2. Momentarily set `Start_PB = 1`.
3. `Motor_Run` energizes and its parallel contact seals the rung in.
4. Releasing START leaves the motor running.
5. `Stop_PB = 1` or `EStop_OK = 0` immediately drops `Motor_Run`.

## Week 2 - Sensors, Timers, and Counters

### 3. Reject photoeye chatter

Timer preset: `50 ms`.

```text
Rung 0
--[XIC PE101_PhotoEye]----------------(TON T_Debounce, PRE 50)--

Rung 1
--[XIC T_Debounce.DN]----------------------------(OTE Part_Detected)--
```

The acceptance check requires the first rung. The second rung is the correct
way to expose a conditioned detection bit for later logic.

Expected behavior:

- A pulse shorter than 50 ms never sets `T_Debounce.DN`.
- A continuously blocked beam for at least 50 ms sets `T_Debounce.DN` and
  `Part_Detected`.
- Clearing the beam resets the non-retentive timer and detection bit.

### 4. Count each carton once

Recommended batch preset: `24` cartons.

```text
Rung 0
--[XIC T_Debounce.DN]----------------(CTU Part_Counter, PRE 24)--

Rung 1
--[XIC Reset_PB]-----------------------------------(RES Part_Counter)--
```

`CTU` already counts the rising edge of its rung, so a carton held in the beam
adds one count, not one count per scan. `Part_Detected` may be used instead of
`T_Debounce.DN`.

`RES Part_Counter` is an output instruction. Place it at the right side of the
reset rung. The counter preset is `24`, with no `ms` unit.

## Week 3 - Interlocks and Drive Control

### 5. Stop a sustained jam

Jam timer preset: `5000 ms`.

```text
Rung 0 - Safe motor command with jam interlock
--[XIO Stop_PB]--[XIC EStop_OK]--[XIO Jam_Fault]--+--[XIC Start_PB]---+--(OTE Motor_Run)--
                                                  |                   |
                                                  +--[XIC Motor_Run]--+

Rung 1 - Detect a sustained blocked beam while running
--[XIC Motor_Run]--[XIC PE101_PhotoEye]--------(TON T_Jam, PRE 5000)--

Rung 2 - Retain the fault
--[XIC T_Jam.DN]------------------------------------(OTL Jam_Fault)--

Rung 3 - Deliberate reset only after the obstruction is clear
--[XIC Reset_PB]--[XIO PE101_PhotoEye]--------------(OTU Jam_Fault)--
```

Do not create a separate rung containing only `XIO Jam_Fault -> OTE Motor_Run`;
that would command the motor whenever there is no fault. Put the jam contact
inside the complete start/stop/seal-in rung.

Expected sequence:

1. Conveyor runs normally with the beam clear.
2. A blocked beam starts `T_Jam`.
3. Clearing the beam before five seconds resets the timer and causes no fault.
4. Five continuous seconds latches `Jam_Fault`.
5. `Jam_Fault` opens the motor rung and stops the conveyor.
6. Clearing the beam alone does not clear the fault.
7. Clear the beam, then press RESET to unlatch the fault.

### 6. Scale the VFD speed reference

Create `VFD_SpeedRef` as a controller `REAL` tag.

```text
Rung 0
--[XIC Motor_Run]------------[MUL Speed_SP, 4.0, VFD_SpeedRef]--

Rung 1
--[XIO Motor_Run]-------------------[MOV 0.0, VFD_SpeedRef]--
```

Scaling check:

| `Speed_SP` | `VFD_SpeedRef` |
|---:|---:|
| 0% | 0 |
| 25% | 100 |
| 50% | 200 |
| 75% | 300 |
| 100% | 400 |

The second rung provides a defined safe-state command when the conveyor is not
running.

## Week 4 - HMI and Alarm Design

### 7. Build the conveyor overview

Create one HMI screen, for example `CV101_Overview`, with these live bindings:

| Display | Recommended object | Required binding |
|---|---|---|
| RUN status | Green state indicator | `Motor_Run` |
| JAM status | Red state indicator | `Jam_Fault` |
| Carton total | Numeric display | `Part_Counter.ACC` |
| Photoeye state | State indicator | `PE101_PhotoEye` |
| Speed request | Numeric input/display | `Speed_SP` |

Only the first three bindings are required for acceptance. Bind object state or
value directly to those controller tags; plain text containing a tag name does
not count as a live binding.

Recommended states:

- RUN: gray when false, green when true.
- JAM: gray when false, red and clearly labeled when true.
- Count: integer with label `ACCEPTED CARTONS`.
- Speed: clamp operator entry to `0-100%`.

### 8. Create an honest jam alarm

Create an HMI alarm with:

| Property | Value |
|---|---|
| Name | `ALM_CV101_JAM` |
| Tag path / trigger | `Jam_Fault` |
| Active condition | Nonzero / true |
| Message | `CV-101 JAM - CLEAR BLOCKAGE AND RESET` |
| Priority | High |
| Acknowledgement | Required |

Do not create alarm definitions triggered by any of these:

- `PE101_PhotoEye`
- `T_Jam.DN`
- `T_Debounce.DN`

Those are detection states, not retained operator-actionable faults. The current
validator rejects the project if any of those raw tags is used as an alarm
trigger.

## Weeks 5-9 - Live Plant Answer Key

Submit one accepted root-cause tag in the solve box. The first tag in each row
is the canonical answer; the alternatives are also accepted.

| Week / mission | Alarm symptom | Submit | Decisive proof |
|---|---|---|---|
| W5 Conditioner temperature | `TAL-1115` low temperature | `TCV-1116` or `ZT-1116` | Controller output reaches about 95%, position feedback remains about 4%, and steam supply pressure is healthy. |
| W5 Deodorizer level | `LAH-3220` high level | `M-3225` or `OL-3225` | `OL-3225 = 0` opens the discharge-pump run rung; pump current and discharge flow collapse before level rises. |
| W6 Boiler drum level | `LAL-4110` low level | `FCV-4112` or `ZT-4112` | Feedwater command rises to about 88%, valve feedback falls near 18%, and pump discharge pressure remains healthy. |
| W6 DT tray temperature | `TAH-2210` high temperature | `TCV-2208` or `ZT-2208` | Controller command falls near 5%, valve feedback remains near 97%, and the valve-deviation rung is true. |
| W7 Cracking mill vibration | `VAH-1120` high vibration | `VT-1120` | Vibration jumps erratically while motor current is normal and the mill is physically smooth; the transmitter cable is damaged. |
| W7 Extractor current | `IAH-2105` high current | `LSH-2130` | The field hopper is full but `LSH-2130` remains false, so the fast drag-conveyor command never energizes. |
| W8 Cooling water temperature | `TAH-4210` high temperature | `M-4215` or `VFD-4215` | `VFD-4215` is faulted, opening the fan run rung; loss of airflow causes the later temperature alarm. |
| W8 Pellet cooler temperature | `TAH-5120` high temperature | `SS-5118` | `M-5118` is running while `SS-5118` reports no rotor motion; the airlock drive pin is sheared. |
| W9 Hexane LEL | `AAH-2301` gas detected | `LSL-2303` | Seal-pot level is not healthy, the low-level alarm rung is true, and barrier-fluid loss explains the real seal leak. |
| W9 Bleacher vacuum | `PAL-3140` low vacuum | `PCV-3412` or `ZT-3412` | Motive-steam valve command and feedback disagree by more than 20%; the main steam header remains healthy. |

## Diagnostic proof rungs

These are the most useful ESCO diagnostic rungs for the ten plant incidents.
They are evidence to inspect, not course rungs that need to be rebuilt.

```text
PREP_COND_TEMP
ABS(TCV-1116 - ZT-1116) > 20
    -> TON ZDA_1116_TMR PRE 30000
    -> OTE ZDA_1116

PREP_MILL_VIB
GRT VT-1120 0.30
    -> TON VAH_TMR_1120 PRE 10000
    -> OTE VAH_1120
Compare against inactive current alarm: GRT IT-1110 135.0 -> OTE IAH_1110.

EXT_EXTRACTOR_AMPS
XIC LSH-2130
    -> TON FAST_TMR PRE 2000
    -> OTE CV2135_FAST
The field hopper is full while this rung remains false.

EXT_DT_TEMP
ABS(TCV-2208 - ZT-2208) > 25
    -> TON ZDA_TMR_2208 PRE 20000
    -> OTE ZDA_2208

EXT_HEXANE_LEL
XIO LSL-2303
    -> OTE LAL_2303
`LSL-2303 = 1` means seal-pot level healthy; it is false during the incident.

REF_BLEACH_VAC
ABS(PCV-3412 - ZT-3412) > 20
    -> TON ZDA_TMR_3412 PRE 30000
    -> OTE ZDA_3412

REF_DEOD_LEVEL
XIC P3225_Start
    -> XIC OL-3225
    -> XIO LT3220_LOLO
    -> OTE M-3225
`OL-3225` is false and breaks the motor command.

UTL_DRUM_LEVEL
ABS(FCV-4112 - ZT-4112) > 20
    -> TON ZDA_TMR_4112 PRE 30000
    -> OTE ZDA_4112

UTL_CW_TEMP
XIC CT1_Start
    -> XIO VFD-4215
    -> OTE M-4215
`VFD-4215 = 1` means faulted, so the XIO opens.

MEAL_COOLER_TEMP
XIC M-5118
    -> XIO SS-5118
    -> TON SPD_TMR_5118 PRE 8000
    -> OTE SPA_5118
```

## Weeks 10-12 - Shift Pools

### Week 10 - Three-system diagnostic shift

Three correct diagnoses are required from this four-scenario pool:

| Scenario | Submit |
|---|---|
| Conditioner temperature | `TCV-1116` or `ZT-1116` |
| Extractor current | `LSH-2130` |
| Cooling-water temperature | `M-4215` or `VFD-4215` |
| Deodorizer level | `M-3225` or `OL-3225` |

### Week 11 - Graveyard alarm gauntlet

Four correct diagnoses are required from this five-scenario pool:

| Scenario | Submit |
|---|---|
| Cracking mill vibration | `VT-1120` |
| DT tray temperature | `TCV-2208` or `ZT-2208` |
| Hexane LEL | `LSL-2303` |
| Pellet cooler temperature | `SS-5118` |
| Boiler drum level | `FCV-4112` or `ZT-4112` |

### Week 12 - Plant 7 qualification shift

Five unique diagnoses are required. Any five of the ten canonical answers below
complete the capstone, provided the shift finishes with fewer than three
shutdown strikes:

```text
TCV-1116
VT-1120
LSH-2130
TCV-2208
LSL-2303
PCV-3412
M-3225
FCV-4112
M-4215
SS-5118
```

## Fast pass checklist

1. Use the exact capitalization shown for course tags.
2. Put output instructions at the right end of a rung.
3. Put `Motor_Run` and `Start_PB` in parallel for the seal-in.
4. Keep STOP, E-stop, and jam contacts in series outside that branch.
5. Use `50` for the debounce timer and `5000` for the jam timer.
6. Use a count preset such as `24` for `Part_Counter`, never `100 ms`.
7. Reset the counter with `XIC Reset_PB -> RES Part_Counter`.
8. Create `VFD_SpeedRef` as `REAL`, multiply `Speed_SP` by `4.0`, and move
   zero to the output while stopped.
9. Bind the HMI to real tags, not labels containing tag names.
10. Trigger the jam alarm from `Jam_Fault` only.
