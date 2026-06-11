// ============================================================================
// Fault scenarios, NPC roster, radio scripts, and ladder logic
// ============================================================================

export const NPCS = {
  marcy: { name: 'Marcy Delgado',   role: 'Control Room Operator', voice: { pitch: 1.25, rate: 1.02 },
    color: '#7fd4ff', personality: 'competent, dry' },
  dale:  { name: 'Dale "Bulldog" Hendricks', role: 'Extraction Operator', voice: { pitch: 0.7, rate: 0.95 },
    color: '#ff9d6b', personality: 'grumpy, hates techs' },
  pete:  { name: 'Pete Novak',      role: 'Outside Operator', voice: { pitch: 1.1, rate: 1.12 },
    color: '#9dff8a', personality: 'eager, young, honest' },
  rhonda:{ name: 'Rhonda Pruitt',   role: 'Refinery Operator', voice: { pitch: 1.05, rate: 0.98 },
    color: '#ffd07f', personality: 'sarcastic, sharp' },
  goose: { name: 'Gary "Goose" Gustafson', role: 'Utilities Operator', voice: { pitch: 0.85, rate: 0.9 },
    color: '#c8b0ff', personality: 'rambling, conspiratorial' },
  frank: { name: 'Frank Kowalski',  role: 'Shift Supervisor', voice: { pitch: 0.62, rate: 1.0 },
    color: '#ff6b6b', personality: 'mean, impatient' },
  bobby: { name: 'Bobby Tran',      role: 'Maintenance Lead', voice: { pitch: 0.95, rate: 1.15 },
    color: '#7fffd4', personality: 'busy, helpful' },
};

// Radio channels — field operator depends on scenario area
export const CHANNELS = [
  { id: 'ctrl',  label: 'Control Room',  npc: 'marcy' },
  { id: 'field', label: 'Field Operator', npc: null },  // resolved per scenario
  { id: 'sup',   label: 'Supervisor',    npc: 'frank' },
  { id: 'maint', label: 'Maintenance',   npc: 'bobby' },
];

export const FIELD_NPC_BY_AREA = {
  PREP: 'pete', EXTRACTION: 'dale', REFINERY: 'rhonda', UTILITIES: 'goose', MEAL: 'pete',
};

export const QUESTIONS = [
  { id: 'q_see',   text: 'What are you seeing out at the equipment?' },
  { id: 'q_gauge', text: 'Check the local gauges / valve position for me?' },
  { id: 'q_work',  text: 'Any recent maintenance or changes on it?' },
  { id: 'q_trend', text: 'How do the trends look from your end?' },
  { id: 'q_first', text: 'Where would you check first?' },
];

// Generic per-NPC fallback replies when a scenario has nothing specific
export const FALLBACKS = {
  marcy: 'Nothing else jumping out on my screens right now. Keep me posted.',
  dale:  'I got actual work to do out here. Read your fancy screens and leave me alone.',
  pete:  "Uh, nothing weird that I can see from here, but I'm still learning where everything is, honestly.",
  rhonda:'Everything on my end is exactly as mediocre as it always is, sweetheart.',
  goose: "Can't say. You know they cut the PM budget again? That's the REAL problem at this plant.",
  frank: "Why are you on the radio asking ME? I pay YOU to know. Get me an answer or get me a resume.",
  bobby: "I'm elbows-deep in the pellet mill gearbox right now, man. Unless it's burning down, gimme an hour.",
};

// ---------------------------------------------------------------------------
// Ladder DSL helpers
// ---------------------------------------------------------------------------
const XIC = (tag, on) => ({ t: 'XIC', tag, on: !!on });
const XIO = (tag, on) => ({ t: 'XIO', tag, on: !!on });
const OTE = (tag, on) => ({ t: 'OTE', tag, on: !!on });
const OTL = (tag, on) => ({ t: 'OTL', tag, on: !!on });
const TON = (tag, pre, on) => ({ t: 'TON', tag, pre, on: !!on });
const CMP = (t, a, b, on) => ({ t, a, b, on: !!on });   // GRT / LES / GEQ / LEQ, a = live tag
const PIDB = (tag, pv, cv, on) => ({ t: 'PID', tag, pv, cv, on: !!on });
const DEV = (tag, a, b, lim, on) => ({ t: 'DEV', tag, a, b, lim, on: !!on }); // |a-b| > lim deviation block

// ============================================================================
// SCENARIOS
// ============================================================================
export const SCENARIOS = [

// --------------------------------------------------------------------------
{
  id: 'PREP_COND_TEMP',
  title: 'Conditioner Outlet Temperature Low',
  area: 'PREP', screen: 'PREP', anchor: 'conditioner',
  alarm: { tag: 'TT-1115', name: 'TAL-1115', text: 'BEAN CONDITIONER OUTLET TEMP LOW', dir: 'lo' },
  answer: 'TCV-1116', accept: ['TCV-1116', 'ZT-1116'],
  trendTags: ['TT-1115', 'TCV-1116', 'ZT-1116', 'PT-1117'],
  explain: 'TCV-1116 steam valve positioner failed — the controller output wound up to 95% but the valve stayed parked near closed (ZT-1116 ≈ 4%). Steam supply pressure PT-1117 was normal the whole time. Cold flakes kill extraction efficiency, hence the cascade of alarms.',
  overrides: [
    { tag: 'TT-1115',  to: 126, start: 0,  dur: 100 },
    { tag: 'TT-1115',  to: 114, start: 120, dur: 110 },
    { tag: 'TCV-1116', to: 95,  start: 0,  dur: 70 },
    { tag: 'ZT-1116',  to: 4,   start: 0,  dur: 25 },
  ],
  effects: [{ anchor: 'conditioner', type: 'hiss', vol: 0.15 }],
  radio: {
    auto: [
      { at: 12,  who: 'marcy', text: 'Heads up — conditioner outlet temp is sagging. TAL-1115 just came in. Flakes are gonna come out cold and greasy.' },
      { at: 45,  who: 'frank', text: 'Who broke my prep building? Tech — clock is running. I want a tag name, not a story.' },
      { at: 95,  who: 'dale',  lie: true, notEasy: true, text: 'Bet you it’s them boilers again. Pressure’s been swingin’ all night, I’d stake my pension on it.' },
      { at: 150, who: 'pete',  text: 'I’m up at the conditioner... that steam valve don’t sound like it’s passing much of anything.' },
      { at: 260, who: 'frank', text: 'CRITICAL alarm in prep and my technician is sightseeing. MOVE.' },
    ],
    qa: {
      ctrl: {
        q_see:   { text: 'Conditioner outlet keeps dropping. Steam pressure to prep looks normal, 46 pound. The temperature controller output is pegged at like 95 percent though. Something downstream of the output isn’t listening.' },
        q_trend: { text: 'TT-1115 trending down steady since the alarm. TCV output climbed to max and the temp never responded. Supply pressure flat. You do the math.' },
        q_first: { text: 'If my output is maxed and nothing’s heating up, I’d be looking at the valve itself, not the boiler.' },
      },
      field: {
        q_see:   { text: 'Beans comin’ out the conditioner barely warm, I can hold my hand on the discharge. Usually you can’t.' },
        q_gauge: { text: 'Standing at TCV-1116 right now. Stem position indicator is sittin’ near closed and it ain’t moving. Your screen probably says somethin’ different, huh?' },
        q_work:  { text: 'Didn’t touch it myself, but maintenance had it apart not long ago, ask Bobby.' },
      },
      sup: {
        q_first: { text: 'Check first? How about you check the want-ads if that prep building trips. NOW GET ON IT.' },
        q_see:   { text: 'I see a technician on the radio instead of fixing my plant, that’s what I see.' },
      },
      maint: {
        q_work:  { text: 'Oh yeah — we rebuilt the positioner on TCV-1116 maybe a month back. Cheap aftermarket kit, I told ’em it wouldn’t last. Diaphragms in those things are junk.' },
        q_first: { text: 'Anything we rebuilt with the cheap kits. Start with that conditioner steam valve.' },
      },
    },
  },
  routines: [
    { name: 'P11_Conditioner', program: 'Prep', rungs: [
      { c: 'Bean Conditioner temperature control loop. PV = TT-1115, CV = TCV-1116. Setpoint 145 degF.',
        els: [XIC('Prep_Permissive', true), PIDB('TIC_1115', 'TT-1115', 'TCV-1116', true)] },
      { c: 'Conditioner outlet temp LOW alarm. Alarm if TT-1115 below 130 degF for 15 sec.',
        els: [CMP('LES', 'TT-1115', '130.0', true), TON('TAL_1115_TMR', '15000', true), OTE('TAL_1115', true)] },
      { c: 'TCV-1116 VALVE DEVIATION — command vs position feedback. If output and ZT-1116 disagree by more than 20% for 30 sec, flag positioner/actuator failure.',
        els: [DEV('ZDA_1116_DEV', 'TCV-1116', 'ZT-1116', '20.0', true), TON('ZDA_1116_TMR', '30000', true), OTE('ZDA_1116', true)] },
      { c: 'Conditioner steam supply pressure low (header side). Not active — supply is healthy.',
        els: [CMP('LES', 'PT-1117', '30.0', false), OTE('PAL_1117', false)] },
    ]},
    { name: 'P11_Mills', program: 'Prep', rungs: [
      { c: 'Cracking Mill A run permissive — all healthy.',
        els: [XIC('Mill_A_Start', true), XIO('VAH_1120', true), XIO('Mill_A_OL', true), OTE('M-1110', true)] },
      { c: 'Cracking mill A vibration high alarm. Not active.',
        els: [CMP('GRT', 'VT-1120', '0.30', false), TON('VAH_TMR', '10000', false), OTE('VAH_1120', false)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'PREP_MILL_VIB',
  title: 'Cracking Mill A High Vibration',
  area: 'PREP', screen: 'PREP', anchor: 'crackingA',
  alarm: { tag: 'VT-1120', name: 'VAH-1120', text: 'CRACKING MILL A BEARING VIBRATION HIGH', dir: 'hi' },
  answer: 'VT-1120', accept: ['VT-1120'],
  trendTags: ['VT-1120', 'IT-1110', 'IT-1112', 'M-1110'],
  explain: 'The vibration transmitter VT-1120 itself failed — its cable was pinched during last week’s screen change, giving erratic spikes. Mill amps were dead normal and the field operator confirmed the mill ran smooth. A failed instrument is still a failed I/O point: trust, but verify.',
  overrides: [
    { tag: 'VT-1120', to: 0.38, start: 0,   dur: 30, jitter: 0.22 },
    { tag: 'VT-1120', to: 0.55, start: 120, dur: 30, jitter: 0.35 },
  ],
  effects: [],
  radio: {
    auto: [
      { at: 10,  who: 'marcy', text: 'Vibration alarm on Cracking Mill A. Reading is jumping all over the place — point one to point five in seconds.' },
      { at: 40,  who: 'frank', text: 'If a roll bearing lets go in that mill it’s a quarter million dollar rebuild. Shut it down or clear it, tech. You got minutes.' },
      { at: 80,  who: 'dale',  lie: true, notEasy: true, text: 'Heard mill A screamin’ from across the yard yesterday. Them bearings are TOAST, I guarantee it.' },
      { at: 140, who: 'pete',  text: 'I’m at the mill — honestly she sounds normal to me? Smooth. No heat comin’ off the bearing housings either, I checked with the temp gun.' },
      { at: 250, who: 'frank', text: 'CRITICAL on mill A and you’re still scratching your head. UNBELIEVABLE.' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'It’s weird — vibration spikes straight up and down like a square wave. Real bearing failures trend up over hours. And amps on the mill haven’t moved at all.' },
        q_see:   { text: 'Mill A amps steady at 104. Mill B identical. Only thing screaming is that one vibration point.' },
        q_first: { text: 'A signal that jumps rail-to-rail with steady amps? I’d suspect the instrument before the iron.' },
      },
      field: {
        q_see:   { text: 'Standing next to mill A right now. Sounds smooth, no rattle, no smell, bearing housings are warm but normal-warm. I dunno what the computer’s seeing.' },
        q_gauge: { text: 'There’s no local vib gauge, but I put my hand on the housing. Steady as a rock. Honest.' },
        q_work:  { text: 'Maintenance changed the screens in mill A last week I think? Bobby would know.' },
      },
      sup: {
        q_first: { text: 'You want MY troubleshooting advice? Fine: check the thing that’s alarming, genius. And if you shut my mill down for nothing, we’re gonna have words.' },
      },
      maint: {
        q_work:  { text: 'Screen change on mill A last Tuesday. Hey — actually — the guys had to unbolt the vib probe bracket to get the guard off, and the cable run looked pinched when they put it back. Was gonna write a ticket on VT-1120 and never did. Sorry man.' },
        q_first: { text: 'Honestly? Check that vib probe wiring before you condemn the mill.' },
      },
    },
  },
  routines: [
    { name: 'P11_Mills', program: 'Prep', rungs: [
      { c: 'Cracking Mill A run circuit. Trips on sustained high vibration or overload.',
        els: [XIC('Mill_A_Start', true), XIO('VSH_1120_TRIP', true), XIO('Mill_A_OL', true), OTE('M-1110', true)] },
      { c: 'Mill A vibration HIGH alarm — VT-1120 above 0.30 in/s for 10 sec. ** NOTE 3/14: erratic readings reported after screen change, instrument suspect — J.M. **',
        els: [CMP('GRT', 'VT-1120', '0.30', true), TON('VAH_TMR_1120', '10000', true), OTE('VAH_1120', true)] },
      { c: 'Mill A vibration TRIP — 0.45 in/s for 20 sec shuts down the mill.',
        els: [CMP('GRT', 'VT-1120', '0.45', false), TON('VSH_TMR_1120', '20000', false), OTL('VSH_1120_TRIP', false)] },
      { c: 'Mill A motor current high alarm. Not active — amps normal.',
        els: [CMP('GRT', 'IT-1110', '135.0', false), OTE('IAH_1110', false)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'EXT_EXTRACTOR_AMPS',
  title: 'Extractor Main Drive Current High',
  area: 'EXTRACTION', screen: 'EXTRACTION', anchor: 'extractor',
  alarm: { tag: 'IT-2105', name: 'IAH-2105', text: 'EXTRACTOR MAIN DRIVE CURRENT HIGH', dir: 'hi' },
  answer: 'LSH-2130', accept: ['LSH-2130'],
  trendTags: ['IT-2105', 'LT-2110', 'LSH-2130', 'M-2135'],
  explain: 'The spent flake hopper high-level switch LSH-2130 failed (stuck reading LOW). The PLC never sped up the drag conveyor, the hopper heaped full, and the extractor drive started grinding against backed-up flake. The HMI swore the hopper was empty while the field operator was standing in spilled flake — when the screen and the field disagree, the instrument is lying.',
  overrides: [
    { tag: 'IT-2105', to: 124, start: 0,   dur: 100 },
    { tag: 'IT-2105', to: 136, start: 120, dur: 100 },
    { tag: 'LT-2110', to: 80,  start: 30,  dur: 120 },
  ],
  effects: [{ anchor: 'extractor', type: 'grind', vol: 0.4 }],
  radio: {
    auto: [
      { at: 14,  who: 'marcy', text: 'Extractor drive amps climbing — 115 and rising. High alarm is in. That drive trips at 138.' },
      { at: 50,  who: 'dale',  text: 'Somethin’s loadin’ up the extractor, I can hear the drive luggin’ from the stairwell.' },
      { at: 100, who: 'goose', lie: true, notEasy: true, text: 'Voltage sag, fellas. Utility’s been shavin’ us all week. Low voltage, high amps — basic physics. Nothin’ wrong with YOUR equipment.' },
      { at: 160, who: 'dale',  text: 'HEY. Whoever’s on shift tech — the spent flake hopper is HEAPED OVER. Flake all over the deck down here. Your magic computer didn’t notice?!' },
      { at: 255, who: 'frank', text: 'That extractor motor is a six-week lead item. If it trips on overload you’ll be explaining it to corporate, not me.' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'Drive amps ramping steady. Bed level’s creeping up too. But here’s the thing — the discharge hopper level switch shows NORMAL. Drag conveyor’s loafing along at minimum speed like everything’s fine.' },
        q_see:   { text: 'HMI says the spent flake hopper is clear — LSH-2130 has been quiet all shift. Honestly it’s been quiet for... huh. Days.' },
        q_first: { text: 'Amps up usually means the discharge end is backing up. But my hopper switch says clear, so... I don’t know what to tell you.' },
      },
      field: {
        q_see:   { text: 'You want eyes? Here’s eyes: the discharge hopper is heaped over the grating, flake spillin’ on the deck, and the drag conveyor’s crawlin’ like it’s Sunday. THAT’s what I see, college boy.' },
        q_gauge: { text: 'I’m lookin’ at the hopper level switch right now. Flake’s buried PAST it and the little status light on the switch head says... clear. Piece of garbage. 28 years and these things still surprise me.' },
        q_work:  { text: 'Nobody touches my extractor. Whatever broke, broke on its own.' },
      },
      sup: {
        q_see: { text: 'What do I see? Overtime, that’s what I see. Dale better not be exaggerating and YOU better have an answer before that drive trips.' },
      },
      maint: {
        q_work: { text: 'No work orders on the extractor this month. Those paddle-style level switches in the flake hopper cake up though — we’ve replaced two this year.' },
      },
    },
  },
  routines: [
    { name: 'E22_Extractor', program: 'Extraction', rungs: [
      { c: 'Extractor main drive run circuit.',
        els: [XIC('Extractor_Start', true), XIO('IT2105_TRIP', true), OTE('M-2105', true)] },
      { c: 'Extractor drive current HIGH alarm at 115A / trip at 138A.',
        els: [CMP('GRT', 'IT-2105', '115.0', true), TON('IAH_TMR', '5000', true), OTE('IAH_2105', true)] },
      { c: 'Spent flake drag conveyor speed select. Hopper hi-level LSH-2130 commands FAST speed to pull the hopper down. ** Switch has never made this rung true this shift. **',
        els: [XIC('LSH-2130', false), TON('FAST_TMR', '2000', false), OTE('CV2135_FAST', false)] },
      { c: 'Spent flake hopper HIGH level alarm from LSH-2130.',
        els: [XIC('LSH-2130', false), OTE('LAH_2130', false)] },
      { c: 'Extractor bed level high — feed cutback.',
        els: [CMP('GRT', 'LT-2110', '85.0', false), OTE('FEED_CUTBACK', false)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'EXT_DT_TEMP',
  title: 'DT Tray 4 Temperature High',
  area: 'EXTRACTION', screen: 'EXTRACTION', anchor: 'dt',
  alarm: { tag: 'TT-2210', name: 'TAH-2210', text: 'DESOLVENTIZER-TOASTER TRAY 4 TEMP HIGH', dir: 'hi' },
  answer: 'TCV-2208', accept: ['TCV-2208', 'ZT-2208'],
  trendTags: ['TT-2210', 'TCV-2208', 'ZT-2208', 'FT-2209'],
  explain: 'The DT sparge steam valve TCV-2208 stuck wide open. The controller cut its output to 5% but the position feedback ZT-2208 stayed at 97% and sparge flow stayed pegged. Scorched meal and a screaming relief valve later, the deviation alarm rung in E22_DT had the answer the whole time.',
  overrides: [
    { tag: 'TT-2210',  to: 243,  start: 0,   dur: 110 },
    { tag: 'TT-2210',  to: 252,  start: 120, dur: 100 },
    { tag: 'TCV-2208', to: 5,    start: 10,  dur: 40 },
    { tag: 'ZT-2208',  to: 97,   start: 0,   dur: 15 },
    { tag: 'FT-2209',  to: 9800, start: 0,   dur: 60 },
    { tag: 'PT-2206',  to: 47,   start: 0,   dur: 90 },
  ],
  effects: [{ anchor: 'dt', type: 'steam', vol: 0.8 }],
  radio: {
    auto: [
      { at: 10,  who: 'marcy', text: 'High temp on DT tray four and climbing fast. If tray seven follows, we scorch every pound of meal in the tower.' },
      { at: 42,  who: 'dale',  text: 'DT relief’s liftin’! Steam blowin’ off the top of the tower like Old Faithful. Real impressive. Real EXPENSIVE.' },
      { at: 90,  who: 'goose', lie: true, notEasy: true, text: 'Boiler’s overfirin’, I can feel it in my teeth. Header pressure’s probably through the roof. Check MY equipment last for once.' },
      { at: 165, who: 'marcy', text: 'Get this — my sparge steam controller output says five percent. Five! And flow is still pegged at ninety-eight hundred. Make it make sense, tech.' },
      { at: 250, who: 'frank', text: 'You are about to burn a whole tower of meal. WHY is steam still going into my DT?!' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'Tray four ramping like a rocket. The temperature controller already slammed its output to five percent — but steam FLOW never dropped. FT-2209 is pegged. Either my flow meter is haunted or that valve didn’t close.' },
        q_see:   { text: 'Sparge pressure’s sagging a touch because we’re passing so much steam. Header from the boiler is normal — 126. It’s not a supply problem, it’s a too-MUCH-steam problem.' },
        q_first: { text: 'Output says closed, flow says wide open. I’d go stare at that sparge valve.' },
      },
      field: {
        q_see:   { text: 'The whole DT deck is fogged in with steam. Relief’s howlin’. You wanna come down and enjoy the sauna or you gonna fix it?' },
        q_gauge: { text: 'FINE. I’m at TCV-2208... position arrow’s buried at full open. Ain’t moving. You can hear the actuator hissin’ — diaphragm’s probably tore. There. I did your job for you. AGAIN.' },
        q_work:  { text: 'Ask maintenance, I don’t babysit valves.' },
      },
      sup: {
        q_first: { text: 'First?! You check whatever keeps me from calling the plant manager at 2 AM. That’s your troubleshooting tree: ME at the top, angry.' },
      },
      maint: {
        q_work: { text: 'That sparge valve’s original equipment, 1996 vintage. Actuator diaphragm has been on the replacement list for two years. Two. Years.' },
      },
    },
  },
  routines: [
    { name: 'E22_DT', program: 'Extraction', rungs: [
      { c: 'DT Tray 4 temperature control. PV = TT-2210, CV = TCV-2208 sparge steam valve. SP 215 degF.',
        els: [XIC('DT_Permissive', true), PIDB('TIC_2210', 'TT-2210', 'TCV-2208', true)] },
      { c: 'DT Tray 4 temp HIGH alarm — above 235 degF.',
        els: [CMP('GRT', 'TT-2210', '235.0', true), TON('TAH_TMR_2210', '8000', true), OTE('TAH_2210', true)] },
      { c: 'TCV-2208 VALVE DEVIATION — controller output vs ZT-2208 position. Disagreement > 25% for 20 sec = stuck valve / actuator failure.',
        els: [DEV('ZDA_2208_DEV', 'TCV-2208', 'ZT-2208', '25.0', true), TON('ZDA_TMR_2208', '20000', true), OTE('ZDA_2208', true)] },
      { c: 'DT high-high temp interlock — 255 degF closes the steam block valve and trips feed.',
        els: [CMP('GRT', 'TT-2210', '255.0', false), TON('TSH_TMR', '5000', false), OTL('DT_STEAM_TRIP', false)] },
      { c: 'Sparge steam supply pressure low alarm. Not active.',
        els: [CMP('LES', 'PT-2206', '35.0', false), OTE('PAL_2206', false)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'EXT_HEXANE_LEL',
  title: 'Hexane Vapor Detected — Pump Alley',
  area: 'EXTRACTION', screen: 'EXTRACTION', anchor: 'pumpAlley',
  alarm: { tag: 'AT-2301', name: 'AAH-2301', text: 'HEXANE VAPOR DETECTED PUMP ALLEY — %LEL HIGH', dir: 'hi' },
  answer: 'LSL-2303', accept: ['LSL-2303'],
  trendTags: ['AT-2301', 'PT-2305', 'LSL-2303', 'FSL-2304'],
  explain: 'Miscella pump P-2302’s mechanical seal was failing — the seal pot level switch LSL-2303 dropped out, meaning the barrier fluid was gone and hexane was weeping past the seal into the alley. The gas detector was telling the truth; the root cause I/O point was the seal pot switch that should have tripped the pump.',
  overrides: [
    { tag: 'AT-2301', to: 18, start: 0,   dur: 100, jitter: 2 },
    { tag: 'AT-2301', to: 34, start: 120, dur: 100, jitter: 3 },
    { tag: 'LSL-2303', set: 0, at: 5 },
    { tag: 'PT-2305', to: 70, start: 30, dur: 90, jitter: 2.5 },
  ],
  effects: [{ anchor: 'pumpAlley', type: 'leak', vol: 0.35 }],
  radio: {
    auto: [
      { at: 10,  who: 'marcy', text: 'LEL detector in the pump alley just jumped. Eighteen percent. This is the one alarm we do NOT sit on, people.' },
      { at: 40,  who: 'frank', text: 'Hexane in the alley?! Nobody strikes an arc, nobody drives a truck past extraction, NOTHING until the tech finds the source. GO.' },
      { at: 78,  who: 'dale',  text: 'Smells like a paint booth down here by the miscella pumps. I’m standin’ upwind. I ain’t dyin’ for this place at nineteen bucks an hour.' },
      { at: 130, who: 'goose', lie: true, notEasy: true, text: 'Them LEL heads false-alarm every humid night, fellas. Bad sensor, calibrate it Monday, everybody relax.' },
      { at: 240, who: 'frank', text: 'CRITICAL gas reading and no answer yet. If this hits trip level the whole extraction train slams down. FIND. THE. LEAK.' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'LEL’s real — it ramped, it didn’t step. Sensor faults step. And look at P-2302: discharge pressure’s gone fuzzy, like the pump’s ingesting vapor. Seal pot low-level switch dropped out about a minute before the LEL came up.' },
        q_see:   { text: 'P-2302 is still running. Seal flush flow shows OK, but the seal POT level switch is showing LOW. That barrier fluid went somewhere, and I bet it went out the seal.' },
        q_first: { text: 'Seal pot low plus LEL rising at the same pump? That’s a seal failure. Check the pump seal instrumentation.' },
      },
      field: {
        q_see:   { text: 'There’s a wet stripe down the side of P-2302 and a sheen on the concrete. That ain’t rainwater, sport.' },
        q_gauge: { text: 'Seal pot sight glass on P-2302 is EMPTY. Bone dry. Switch oughta be screamin’... is it? Huh. Figures.' },
        q_work:  { text: 'That pump’s been whinin’ for a week. I wrote it on the pass-down log that NOBODY reads.' },
      },
      sup: {
        q_first: { text: 'You’re asking me where to check while hexane fills my pump alley. P-2302’s been on the bad actor list THREE QUARTERS RUNNING. Why do I know that and you don’t?' },
      },
      maint: {
        q_work: { text: 'P-2302 seal was scheduled for replacement at the spring outage — got bumped for budget. The seal pot switch LSL-2303 is your canary on that pump. If it’s low, the seal’s going.' },
      },
    },
  },
  routines: [
    { name: 'E23_Pumps', program: 'Extraction', rungs: [
      { c: 'Miscella transfer pump P-2302 run circuit. Trips on seal pot low level after 60 sec delay. ** Seal pot LSL-2303: 1 = level OK. **',
        els: [XIC('P2302_Start', true), XIC('LSL-2303', false), TON('SEAL_TRIP_TMR', '60000', false), OTE('M-2302', true)] },
      { c: 'P-2302 seal pot LOW level alarm — barrier fluid lost, seal failure likely.',
        els: [XIO('LSL-2303', true), OTE('LAL_2303', true)] },
      { c: 'P-2302 seal flush low flow alarm. Not active — flush flow OK.',
        els: [XIO('FSL-2304', false), TON('FSL_TMR', '10000', false), OTE('FAL_2304', false)] },
      { c: 'Pump alley hexane HIGH alarm at 15% LEL. HIGH-HIGH at 40% trips extraction train.',
        els: [CMP('GRT', 'AT-2301', '15.0', true), OTE('AAH_2301', true)] },
      { c: 'Hexane HIGH-HIGH trip — 40% LEL.',
        els: [CMP('GRT', 'AT-2301', '40.0', false), TON('LEL_TRIP_TMR', '3000', false), OTL('EXT_GAS_TRIP', false)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'REF_BLEACH_VAC',
  title: 'Bleacher Vacuum Low',
  area: 'REFINERY', screen: 'REFINERY', anchor: 'bleacher',
  alarm: { tag: 'PT-3140', name: 'PAL-3140', text: 'BLEACHER VACUUM LOW', dir: 'lo' },
  answer: 'PCV-3412', accept: ['PCV-3412', 'ZT-3412'],
  trendTags: ['PT-3140', 'PT-3410', 'PCV-3412', 'ZT-3412'],
  explain: 'PCV-3412, the ejector motive steam valve, drifted closed because its actuator was bleeding air through a cracked diaphragm. Motive steam pressure fell, the ejector lost suction, and bleacher vacuum decayed. The boiler header was normal the whole time — Goose’s "boiler problem" theory cost everyone who believed it.',
  overrides: [
    { tag: 'PT-3140', to: 20.8, start: 0,   dur: 110 },
    { tag: 'PT-3140', to: 17.5, start: 120, dur: 100 },
    { tag: 'ZT-3412', to: 31,   start: 0,   dur: 90 },
    { tag: 'ZT-3412', to: 22,   start: 120, dur: 80 },
    { tag: 'PCV-3412', to: 85,  start: 20,  dur: 60 },
    { tag: 'PT-3410', to: 122,  start: 0,   dur: 100 },
  ],
  effects: [{ anchor: 'bleacher', type: 'hiss', vol: 0.45 }],
  radio: {
    auto: [
      { at: 12,  who: 'marcy', text: 'Bleacher vacuum’s falling off. Below 21 inches now. Color’s going to drift out of spec if this keeps up.' },
      { at: 55,  who: 'goose', lie: true, notEasy: true, text: 'Header’s down thirty pound, I’d bet my truck on it. Boiler’s strugglin’ tonight. Tell refinery it ain’t THEIR problem for once.' },
      { at: 95,  who: 'rhonda', text: 'For the record, sweetheart, I can hear air hissing out of SOMETHING up on the ejector deck. Been getting louder for ten minutes. But what do I know, I only work here.' },
      { at: 170, who: 'marcy', text: 'Goose, I’m looking at the boiler header right now — 126 psi, flat as Kansas. Whatever’s starving that ejector, it isn’t the boiler.' },
      { at: 250, who: 'frank', text: 'Off-color oil goes to the rework tank, and rework comes out of MY numbers. Fix my vacuum, tech.' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'Bleacher vacuum and ejector motive pressure are falling together — and here’s the kicker: the pressure controller opened PCV-3412’s command to 85% trying to hold motive pressure, but the position feedback keeps drifting DOWN. Valve’s going closed on its own.' },
        q_see:   { text: 'Main steam header is 126 and steady. Supply’s fine. The loss is between the header and the ejector — that’s one valve.' },
        q_first: { text: 'Command going up while position goes down? That valve’s actuator is losing the fight. Check PCV-3412.' },
      },
      field: {
        q_see:   { text: 'There’s a steady psssssh up on the ejector platform, like an air line bleeding. Vacuum gauge on the bleacher is sliding backwards while I watch. It’s very relaxing, like a spa. A failing spa.' },
        q_gauge: { text: 'I climbed up to PCV-3412 — and you owe me for that, those stairs are NOT OSHA — the actuator’s hissing air from the diaphragm housing and the stem keeps creeping closed. There’s your smoking gun, hotshot.' },
        q_work:  { text: 'Nobody’s touched the ejector station in months. It runs on neglect and prayer, like everything else here.' },
      },
      sup: {
        q_first: { text: 'Where would I check first? I’d check whether my technician knows that off-spec oil costs four cents a pound. CHOP CHOP.' },
      },
      maint: {
        q_work: { text: 'No recent work at the ejectors. We did flag PCV-3412’s actuator with a slow air leak on the last walkdown — it’s on next month’s list. Why, is it worse?' },
      },
    },
  },
  routines: [
    { name: 'R34_Vacuum', program: 'Refinery', rungs: [
      { c: 'Ejector motive steam pressure control. PV = PT-3410, CV = PCV-3412. SP 150 psi.',
        els: [XIC('Ref_Vac_Permissive', true), PIDB('PIC_3410', 'PT-3410', 'PCV-3412', true)] },
      { c: 'Bleacher vacuum LOW alarm — below 22 inHg for 20 sec.',
        els: [CMP('LES', 'PT-3140', '22.0', true), TON('PAL_TMR_3140', '20000', true), OTE('PAL_3140', true)] },
      { c: 'PCV-3412 VALVE DEVIATION — command vs ZT-3412 feedback > 20% for 30 sec.',
        els: [DEV('ZDA_3412_DEV', 'PCV-3412', 'ZT-3412', '20.0', true), TON('ZDA_TMR_3412', '30000', true), OTE('ZDA_3412', true)] },
      { c: 'Motive steam pressure LOW — ejector performance degraded below 125 psi.',
        els: [CMP('LES', 'PT-3410', '125.0', true), OTE('PAL_3410', true)] },
      { c: 'Main header low pressure (boiler side). Not active — header healthy.',
        els: [CMP('LES', 'PT-4105', '105.0', false), OTE('PAL_4105', false)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'REF_DEOD_LEVEL',
  title: 'Deodorizer Level High',
  area: 'REFINERY', screen: 'REFINERY', anchor: 'deodorizer',
  alarm: { tag: 'LT-3220', name: 'LAH-3220', text: 'DEODORIZER LEVEL HIGH', dir: 'hi' },
  answer: 'M-3225', accept: ['M-3225', 'OL-3225'],
  trendTags: ['LT-3220', 'M-3225', 'IT-3226', 'FT-3250'],
  explain: 'Discharge pump P-3225 tripped on thermal overload — OL-3225 opened and dropped the run circuit. With nothing pumping out, the deodorizer filled. The clue was the silence on the pump pad and motor amps flat-lining at zero, ten minutes before the level alarm ever sounded.',
  overrides: [
    { tag: 'M-3225',  set: 0, at: 2 },
    { tag: 'OL-3225', set: 0, at: 2 },
    { tag: 'IT-3226', to: 0,  start: 0, dur: 4 },
    { tag: 'FT-3250', to: 6,  start: 0, dur: 30 },
    { tag: 'LT-3220', to: 73, start: 0, dur: 110 },
    { tag: 'LT-3220', to: 84, start: 120, dur: 100 },
  ],
  effects: [{ anchor: 'deodorizer', type: 'quiet', vol: 0 }],
  radio: {
    auto: [
      { at: 12,  who: 'marcy', text: 'Deodorizer level’s coming up faster than it should. High alarm just made. Something downstream stopped taking oil.' },
      { at: 60,  who: 'rhonda', text: 'You know, it got REAL quiet on the discharge pump pad a little while ago. Peaceful, almost. The kind of peaceful that costs money.' },
      { at: 110, who: 'goose', lie: true, notEasy: true, text: 'Level transmitter’s driftin’. Them radar heads can’t handle 480 degree oil, never could. Recalibrate it and go back to bed.' },
      { at: 180, who: 'rhonda', text: 'Flow to storage is down to nothin’, by the way. So unless the oil is evaporating, that pump quit.' },
      { at: 250, who: 'frank', text: 'If hot oil carries over into my vacuum system, the cleanup bill has YOUR name on the memo line. CRITICAL means MOVE.' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'Level’s climbing at a constant rate — that’s a mass balance problem, not a transmitter problem. Inflow steady, outflow ZERO. P-3225 amps went to zero about twelve minutes ago and never came back.' },
        q_see:   { text: 'P-3225 shows STOPPED on my screen with an overload flag. Flow to storage is six gallons a minute, which is basically a leaky valve, not a pump.' },
        q_first: { text: 'The pump. It’s always the pump. Check the overload on P-3225.' },
      },
      field: {
        q_see:   { text: 'Discharge pump’s dead quiet, no fan noise, nothing. Motor’s hot enough to fry an egg on, though. Want me to push the reset like a cowboy, or you wanna do this properly?' },
        q_gauge: { text: 'The overload flag in the starter cabinet for P-3225 is popped. Big orange flag, says TRIPPED, very dramatic. Level in the deod sight glass is high and climbing.' },
        q_work:  { text: 'That motor’s been running hot since the rebuild. Maintenance said it was “within tolerance.” Their tolerance, apparently, not the motor’s.' },
      },
      sup: {
        q_first: { text: 'I don’t do your job AND mine. One hint, ONE: when level goes up, something stopped going OUT. Now impress me.' },
      },
      maint: {
        q_work: { text: 'We rebuilt P-3225’s motor in February — it’s been tripping warm ever since, we’ve got a replacement on order. Did it trip again? The overload’s OL-3225 in the MCC, bucket 14.' },
      },
    },
  },
  routines: [
    { name: 'R32_Deod', program: 'Refinery', rungs: [
      { c: 'Deodorizer discharge pump P-3225 run circuit with seal-in. ** OL-3225 = 1 when overload relay is healthy. Rung is BROKEN — find the open contact. **',
        els: [XIC('P3225_Start', true), XIC('OL-3225', false), XIO('LT3220_LOLO', true), OTE('M-3225', false)] },
      { c: 'P-3225 overload TRIPPED alarm.',
        els: [XIO('OL-3225', true), OTE('OLA_3225', true)] },
      { c: 'Deodorizer level HIGH alarm — above 65% for 15 sec.',
        els: [CMP('GRT', 'LT-3220', '65.0', true), TON('LAH_TMR_3220', '15000', true), OTE('LAH_3220', true)] },
      { c: 'Deodorizer level HIGH-HIGH — 88% trips feed and sparge steam.',
        els: [CMP('GRT', 'LT-3220', '88.0', false), OTL('DEOD_FEED_TRIP', false)] },
      { c: 'RBD oil flow to storage LOW alarm.',
        els: [CMP('LES', 'FT-3250', '20.0', true), TON('FAL_TMR_3250', '20000', true), OTE('FAL_3250', true)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'UTL_DRUM_LEVEL',
  title: 'Boiler Drum Level Low',
  area: 'UTILITIES', screen: 'UTILITIES', anchor: 'boiler',
  alarm: { tag: 'LT-4110', name: 'LAL-4110', text: 'BOILER NO.1 DRUM LEVEL LOW', dir: 'lo' },
  answer: 'FCV-4112', accept: ['FCV-4112', 'ZT-4112'],
  trendTags: ['LT-4110', 'FCV-4112', 'ZT-4112', 'FT-4111'],
  explain: 'The feedwater control valve FCV-4112 failed — its positioner quit following the command. Output wound up to 88% while the valve sagged to 18%, feedwater flow collapsed, and drum level headed for the low-water trip. The pump was fine; its rising discharge pressure was actually proof the valve was pinching off.',
  overrides: [
    { tag: 'LT-4110',  to: 36,  start: 0,   dur: 110 },
    { tag: 'LT-4110',  to: 27,  start: 120, dur: 100 },
    { tag: 'ZT-4112',  to: 18,  start: 0,   dur: 60 },
    { tag: 'FCV-4112', to: 88,  start: 10,  dur: 70 },
    { tag: 'FT-4111',  to: 68,  start: 0,   dur: 80 },
    { tag: 'PT-4116',  to: 242, start: 0,   dur: 80 },
  ],
  effects: [{ anchor: 'boiler', type: 'rumble', vol: 0.5 }],
  radio: {
    auto: [
      { at: 12,  who: 'marcy', text: 'Drum level on boiler one is coming down. Feedwater flow doesn’t match steam flow — we’re going out the bottom of the glass if this keeps up.' },
      { at: 50,  who: 'goose', text: 'I see it, I see it. Pump’s runnin’, sounds strong. Dischage pressure’s actually HIGH if anything. Don’t you go blamin’ my pump.' },
      { at: 105, who: 'goose', lie: true, notEasy: true, text: 'You ask me, the DA tank’s gettin’ slugged with cold condensate again. Chemistry problem. Call the water guy, not me.' },
      { at: 175, who: 'marcy', text: 'Feedwater controller output is at 88 percent. EIGHTY-EIGHT. And flow keeps dropping. That math doesn’t work unless the valve isn’t really open.' },
      { at: 250, who: 'frank', text: 'A low-water trip on boiler one takes the WHOLE PLANT down with it, do you understand? Every minute you waste is a minute closer to a cold dark plant.' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'Classic divergence: controller output climbing, valve position feedback falling, flow falling. Pump discharge pressure RISING — it’s pushing against a closing valve. The valve is the bottleneck.' },
        q_see:   { text: 'P-4115 is running with good amps. Deaerator level is fine. Everything upstream of FCV-4112 is healthy; everything downstream is starving.' },
        q_first: { text: 'Feedwater valve. When output and position feedback tell different stories, believe neither — go look. But it’s the valve.' },
      },
      field: {
        q_see:   { text: 'Sight glass is gettin’ skinny, maybe a third. Burner’s still firin’ away happy as can be, which is the problem, ain’t it.' },
        q_gauge: { text: 'Alright, I’m at the feedwater valve... positioner gauge says 4 PSI signal out — that ain’t right, command that high oughta be 12, 13 pound to the diaphragm. Positioner’s give up the ghost, that’s my read. ’Course nobody listens to ol’ Goose.' },
        q_work:  { text: 'Nobody’s touched boiler one since the annual. Positioners just die sometimes, like my first marriage.' },
      },
      sup: {
        q_first: { text: 'You have a boiler about to trip on low water and you’re conducting INTERVIEWS? The drum, the pump, the valve — ONE of them is lying to you. FIND IT.' },
      },
      maint: {
        q_work: { text: 'FCV-4112’s positioner is the same one that flaked out during the spring start-up — we cleaned it and put it back because there was no spare in stores. There’s STILL no spare in stores, by the way.' },
      },
    },
  },
  routines: [
    { name: 'U41_Boiler', program: 'Utilities', rungs: [
      { c: 'Three-element feedwater control: drum level + steam flow + feedwater flow. CV = FCV-4112.',
        els: [XIC('Blr1_Master', true), PIDB('LIC_4110', 'LT-4110', 'FCV-4112', true)] },
      { c: 'Drum level LOW alarm — below 38% for 10 sec.',
        els: [CMP('LES', 'LT-4110', '38.0', true), TON('LAL_TMR_4110', '10000', true), OTE('LAL_4110', true)] },
      { c: 'FCV-4112 VALVE DEVIATION — command vs ZT-4112 > 20% for 30 sec. Positioner / actuator failure.',
        els: [DEV('ZDA_4112_DEV', 'FCV-4112', 'ZT-4112', '20.0', true), TON('ZDA_TMR_4112', '30000', true), OTE('ZDA_4112', true)] },
      { c: 'Drum level LOW-LOW — 20% = MFT, burner trip, plant steam loss. Pray this stays false.',
        els: [CMP('LES', 'LT-4110', '20.0', false), TON('LOLO_TMR', '3000', false), OTL('BLR1_MFT', false)] },
      { c: 'BFW pump P-4115 run circuit. Healthy.',
        els: [XIC('P4115_Start', true), XIO('P4115_OL', true), OTE('M-4115', true)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'UTL_CW_TEMP',
  title: 'Cooling Water Supply Temp High',
  area: 'UTILITIES', screen: 'UTILITIES', anchor: 'coolingTower',
  alarm: { tag: 'TT-4210', name: 'TAH-4210', text: 'COOLING WATER SUPPLY TEMP HIGH', dir: 'hi' },
  answer: 'M-4215', accept: ['M-4215', 'VFD-4215'],
  trendTags: ['TT-4210', 'M-4215', 'TT-2310', 'PT-4221'],
  explain: 'Cooling tower fan CT-1 dropped offline — its VFD faulted (VFD-4215) and the fan coasted to a stop. With no draft, the tower stopped cooling and supply temperature climbed, dragging the hexane condensers up with it. The drive cabinet’s blinking fault code was the answer, humming motor or not.',
  overrides: [
    { tag: 'M-4215',  set: 0, at: 3 },
    { tag: 'VFD-4215', set: 1, at: 3 },
    { tag: 'TT-4210', to: 95,  start: 0,   dur: 110 },
    { tag: 'TT-4210', to: 101, start: 120, dur: 100 },
    { tag: 'TT-4211', to: 110, start: 0,   dur: 110 },
    { tag: 'TT-2310', to: 112, start: 40,  dur: 120 },
  ],
  effects: [{ anchor: 'coolingTower', type: 'quiet', vol: 0 }],
  radio: {
    auto: [
      { at: 12,  who: 'marcy', text: 'Cooling water supply temp is up four degrees and climbing. Everything in this plant that needs cooling is about to get cranky at once.' },
      { at: 55,  who: 'dale',  text: 'Extraction condensers runnin’ hot already. If I lose hexane recovery the supervisor’s gonna have kittens. FIX YOUR WATER.' },
      { at: 100, who: 'goose', text: 'That’s funny... tower fan CABINET has a red light blinkin’ some kinda gibberish code. F-zero-somethin’. Fan’s freewheelin’ in the breeze. Pretty, actually.' },
      { at: 160, who: 'rhonda', lie: true, notEasy: true, text: 'Probably the basin’s low again and the pump’s cavitating. It does that every August. Top off the basin, sweetheart.' },
      { at: 245, who: 'frank', text: 'Half my plant alarms trace back to your cooling water RIGHT NOW. This is a ONE-FAN plant in summer, genius. GO LOOK AT THE FAN.' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'Supply and return temps rising in lockstep, header pressure normal, basin level normal — so the pump’s moving water fine. The water just isn’t getting COOLED. That’s a fan problem.' },
        q_see:   { text: 'CT fan one shows STOPPED with a drive fault bit set. VFD-4215 is flagged on my screen. The pump is running normal.' },
        q_first: { text: 'The fan drive. Stopped fan plus fault bit isn’t exactly a whodunit.' },
      },
      field: {
        q_see:   { text: 'Tower’s quiet. No fan roar, just water fallin’. The fan blade’s windmilling backwards, lazy-like. Drive cabinet’s got that red FAULT light goin’ blink... blink... blink. Mockin’ me.' },
        q_gauge: { text: 'Cabinet display says fault code F-zero-five. Overcurrent, sez the little card taped inside the door. Want me to reset it? My finger’s right there. Real close. Just sayin’.' },
        q_work:  { text: 'They was supposed to grease that fan gearbox last month. You think they did? I think they didn’t. Tight gearbox’ll overcurrent a drive, that’s all I’m sayin’.' },
      },
      sup: {
        q_first: { text: 'EVERY exchanger in this plant is downstream of that tower and you want a HINT? The fan, Einstein. Look at the FAN.' },
      },
      maint: {
        q_work: { text: 'CT-1 fan gearbox grease PM got deferred — we were short-handed. If that drive’s tripping overcurrent, that gearbox is binding. Either way your dead I/O point is the fan drive.' },
      },
    },
  },
  routines: [
    { name: 'U42_CoolingTower', program: 'Utilities', rungs: [
      { c: 'Cooling tower fan CT-1 run circuit. Drops out on VFD fault. ** VFD-4215: 1 = FAULTED. Rung is BROKEN — fault contact is open. **',
        els: [XIC('CT1_Start', true), XIO('VFD-4215', false), OTE('M-4215', false)] },
      { c: 'CT-1 fan VFD FAULT alarm.',
        els: [XIC('VFD-4215', true), OTE('VFA_4215', true)] },
      { c: 'Cooling water supply temp HIGH alarm — above 92 degF for 30 sec.',
        els: [CMP('GRT', 'TT-4210', '92.0', true), TON('TAH_TMR_4210', '30000', true), OTE('TAH_4210', true)] },
      { c: 'CW circulation pump P-4220 run circuit. Healthy.',
        els: [XIC('P4220_Start', true), XIO('P4220_OL', true), OTE('M-4220', true)] },
      { c: 'Basin level low — makeup valve open command. Not active.',
        els: [CMP('LES', 'LT-4225', '55.0', false), OTE('MAKEUP_VLV', false)] },
    ]},
  ],
},

// --------------------------------------------------------------------------
{
  id: 'MEAL_COOLER_TEMP',
  title: 'Pellet Cooler Discharge Temp High',
  area: 'MEAL', screen: 'MEAL', anchor: 'pelletCooler',
  alarm: { tag: 'TT-5120', name: 'TAH-5120', text: 'PELLET COOLER DISCHARGE TEMP HIGH', dir: 'hi' },
  answer: 'SS-5118', accept: ['SS-5118'],
  trendTags: ['TT-5120', 'LT-5125', 'M-5118', 'SS-5118'],
  explain: 'The cooler discharge airlock RV-5118 sheared its drive pin. The motor M-5118 kept spinning happily — run feedback TRUE — but the zero-speed switch SS-5118 said the rotor itself wasn’t turning. Pellets stopped discharging, the bed piled deep and hot. Motor running does not mean equipment turning: that’s why zero-speed switches exist.',
  overrides: [
    { tag: 'SS-5118', set: 0, at: 4 },
    { tag: 'TT-5120', to: 131, start: 0,   dur: 110 },
    { tag: 'TT-5120', to: 142, start: 120, dur: 100 },
    { tag: 'LT-5125', to: 81,  start: 0,   dur: 130 },
  ],
  effects: [{ anchor: 'pelletCooler', type: 'hiss', vol: 0.2 }],
  radio: {
    auto: [
      { at: 12,  who: 'marcy', text: 'Pellet cooler discharge temp is high and bed level is building. Hot meal in a deep bed is how you get a smolder, people.' },
      { at: 50,  who: 'frank', text: 'If that cooler bed starts smoldering we evacuate meal loadout and I start making phone calls I HATE making. Clock’s ticking, tech.' },
      { at: 95,  who: 'pete',  text: 'I’m at the cooler... weird thing? The airlock motor is running, I can hear it hummin’. But it don’t FEEL right. Too smooth, like it’s not doin’ any work.' },
      { at: 150, who: 'dale',  lie: true, notEasy: true, text: 'Cooler fan’s probably slipped its belt again. Did it in 2019. Whole place is held together with belts and lies.' },
      { at: 250, who: 'frank', text: 'CRITICAL temp in the cooler. WHY is there still meal stacking up in there?!' },
    ],
    qa: {
      ctrl: {
        q_trend: { text: 'Bed level rising, discharge temp rising, but get this — the airlock motor shows RUNNING. Has the whole time. Yet the zero-speed switch on that airlock dropped out right when this started. Motor running, rotor stopped. You see it?' },
        q_see:   { text: 'Cooler fan’s running, amps normal. Pellet mill normal. It’s all piling up at the discharge airlock — in is fine, out is nothing.' },
        q_first: { text: 'When run feedback and zero-speed disagree, something between the motor and the rotor let go. Coupling, shear pin, chain. Check SS-5118’s rung.' },
      },
      field: {
        q_see:   { text: 'Motor on the airlock’s spinnin’ — but I just looked in the sight glass and the rotor pockets are NOT moving. Dead still. Motor’s turnin’ nothing, boss. Sheared somethin’ for sure.' },
        q_gauge: { text: 'Zero-speed switch target on the rotor shaft ain’t rotating. Switch looks fine — it’s telling the truth. The shear pin’s in pieces on the deck, I’m literally holding half of it.' },
        q_work:  { text: 'They jog that airlock hard every time it plugs. Shear pins are the fuse, right? Well, the fuse blew.' },
      },
      sup: {
        q_first: { text: 'A smoldering meal bed put this plant on the news in 2011. I am NOT going back on the news. MOVE FASTER.' },
      },
      maint: {
        q_work: { text: 'RV-5118 plugged twice last week and they kept jogging it against the plug. I TOLD them they’d shear the pin. Bet you a coffee the zero-speed switch is showing stopped while the motor spins.' },
      },
    },
  },
  routines: [
    { name: 'M51_Cooler', program: 'Meal', rungs: [
      { c: 'Cooler discharge airlock RV-5118 run circuit. Motor contactor closed, run feedback TRUE.',
        els: [XIC('RV5118_Start', true), XIO('RV5118_OL', true), OTE('M-5118', true)] },
      { c: 'RV-5118 SPEED DEVIATION — motor running but zero-speed switch SS-5118 shows rotor stopped for 8 sec. Sheared pin / coupling failure.',
        els: [XIC('M-5118', true), XIO('SS-5118', true), TON('SPD_TMR_5118', '8000', true), OTE('SPA_5118', true)] },
      { c: 'Pellet cooler discharge temp HIGH — above 125 degF for 20 sec.',
        els: [CMP('GRT', 'TT-5120', '125.0', true), TON('TAH_TMR_5120', '20000', true), OTE('TAH_5120', true)] },
      { c: 'Cooler bed level HIGH — feed gate cutback above 75%.',
        els: [CMP('GRT', 'LT-5125', '75.0', true), OTE('BED_CUTBACK', true)] },
      { c: 'Cooler exhaust fan run circuit. Healthy.',
        els: [XIC('Fan_Start', true), XIO('Fan_OL', true), OTE('M-5115', true)] },
    ]},
  ],
},
];

// Wrong-guess supervisor abuse, escalating
export const WRONG_GUESS_LINES = [
  'THAT’s your answer? That tag has nothing to do with it. Minus a hundred from your review, hotshot.',
  'Wrong AGAIN. You know what, don’t answer. Just point at things until something fixes itself, that’s clearly the strategy.',
  'I’ve seen contractors with a two-day badge troubleshoot better than this. WRONG.',
  'Incredible. Confidently, loudly, expensively WRONG. Keep going, you’re paying for my boat at this point.',
];

export const SHUTDOWN_LINES = [
  'That’s it. PLANT’S DOWN. You hear that silence? That’s money NOT being made. Find the cause for the restart report — you owe me that much.',
  'Full shutdown. Corporate’s already calling. Identify the failed point for the incident report or so help me...',
];

export const WIN_LINES = {
  1: ['...huh. Yeah. That’s it. Maintenance confirms. Don’t let it go to your head.',
      'Confirmed, that was the point. Fine work. I’ll deny saying that.'],
  2: ['Took you long enough, but that’s the one. Get it fixed.',
      'Maintenance confirms. Next time find it BEFORE my alarm panel looks like a Christmas tree.'],
  3: ['That’s the cause, says maintenance. Shame the plant was DOWN while you figured it out.',
      'Correct. For the restart report. Which I am writing. At 3 AM. Because of you.'],
};
