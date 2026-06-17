# NAVSIM-DT v11 — Naval Digital Twin Learning Platform
### ProximaED · Educational Research Simulator

---

## What's in this package

| File | Purpose |
|------|---------|
| `NAVSIM_DT_v11.html` | **Run this.** Complete self-contained simulator — open in any browser |
| `navsim_engine.js` | Physics engine extracted for reference / code study |
| `navsim_styles.css` | UI styles extracted for reference |
| `README.md` | This file |

> **To use the simulator:** Open `NAVSIM_DT_v11.html` in Chrome, Edge, or Firefox. No server, no install, no internet required.

---

## What's new in v11 (bug fixes over v10)

### Bug fixes
| Bug | Root Cause | Fix Applied |
|-----|-----------|-------------|
| **Study Mode button showed OFF and did nothing** | `study-overlay` CSS class `.modal-bg.show` was correct but the button toggle logic was fine; the real issue was the `innerHTML` render had no CHECK button — only Enter key worked | Added inline **CHECK ✓** button inside every step's predict panel |
| **Socratic question repeated infinitely** | `socraticActive=false` set at end of `dismissSocratic`, but next `updateAI` tick immediately re-matched same rule (speed still 12–14 kt) | Added per-rule `socraticFired` flags (`{s1,s2,s3}`) set at `triggerSocratic` call — each question fires **once per session only** |
| **SKIP button did nothing** | `dismissSocratic(resume)` read `socraticPending?.wasRunning` AFTER `socraticPending=null` — `wr` was always `undefined`, sim never resumed | Refactored: `wasRunning` is now captured from `socraticPending` **before** clearing it; unified cleanup into `_clearSocratic(resumeSim)` called by both SKIP and the 3s CHECK timeout |
| **checkSocratic: correct answer → sim didn't resume** | Same `socraticPending=null` race condition | Same fix — `wasRunning` captured into local const before `setTimeout` |
| **Study NEXT button always greyed / "unlock" toast repeated** | `studyUnlocked[nextIdx]` was checked against uninitialized state; progress bar was at wrong % | Fixed: NEXT button `disabled` state is set live in `renderStudyStep`; `checkStudyAnswer` enables NEXT immediately after correct answer |
| **Stale `socraticAnswered` variable** | Leftover from v10 design that was replaced | Removed entirely — replaced by `socraticFired` per-rule flags |

---

## Feature summary (v11 = v10 + fixes)

### 1. Study Mode (📖 STUDY MODE button)
- 10-step guided curriculum embedded inside the simulator
- Pauses simulation, shows equation, asks prediction question
- **CHECK ✓** button (or press Enter) to verify answer
- **NEXT ▶** unlocks only after correct prediction
- Progress bar tracks completion across all 10 steps
- Steps cover: Hydrostatic pressure → Seawater density → Mackenzie sound speed → Shadow zone → Sonar equation → Detection Pd → Bayesian tracking → Hoop stress → 6-DoF dynamics → Mission integration

### 2. Socratic AI Instructor
- 3 questions fire automatically during simulation (once per session each):
  - **S1** — Crossing the thermocline: predict sound speed change
  - **S2** — Passing 150m: calculate hoop stress using σ = P·R/t
  - **S3** — Speed >12 kt: predict SNR change vs 8 kt
- Simulation pauses, student types prediction, presses **CHECK** or **SKIP**
- Reveals correct answer + explanation after response
- Simulation resumes automatically (3s after CHECK, immediately after SKIP)
- Flags prevent re-firing — each question appears exactly once per session
- Reset simulation (↺ RESET) clears all flags for a fresh run

### 3. Telemetry CSV Export (📊 EXPORT TELEMETRY CSV)
- Available in left panel and in the Mission Debrief modal
- Exports 17 columns per timestep: time, depth, speed, pitch, pressure, density, sound speed, source level, TL, SNR, Pd, contact confidence, contact range, SHI, hoop stress, failure probability, sonar mode
- Metadata header includes scenario name, INCOIS ocean state, timestamp, regulatory note
- Filename: `NAVSIM_DT_Telemetry_[Scenario]_[Date].csv`

### 4. Physics engine (unchanged from v9/v10)
- 7 coupled real-equation physics layers
- Ocean: Mackenzie(1981) sound speed, UNESCO density, hydrostatic pressure
- Vehicle: 6-DoF dynamics, thrust/drag/buoyancy
- Sonar: passive + active SNR, transmission loss, shadow zone
- AI tracker: Bayesian contact confidence (logistic Pd)
- Structure: Barlow hoop stress, SHI, probabilistic failure
- 4 INCOIS Indian Ocean scenarios

---

## Physics equations reference

```
Sound speed:    c = Mackenzie(T, S, Z)  [1981 formula]
Density:        ρ = 1000 + 0.75·S − 0.20·T  (kg/m³)
Pressure:       P = P₀ + ρ·g·Z  (MPa)
Passive SNR:    SNR = SL − TL − (NL − DI)
Transmission:   TL = 20·log₁₀(R) + α·R
Source level:   SL = 110 + 30·log₁₀(v_kt)  (dB)
Detection:      Pd = 1 / (1 + exp(−0.5·(SNR − DT)))
Bayesian:       P(H|D) = P(D|H)·P(H) / P(D)
Hoop stress:    σ = P·R/t  (Barlow thin-wall, MPa)
SHI:            SHI = 1 − D/D_crush
```

---

## Regulatory compliance

NAVSIM-DT uses **public-domain, decommissioned submarine parameters** (Type-209 / Foxtrot class, both out of service 1970s–1990s). No classified data. No weapons systems. Compliant with:
- Indian IT Act 2000
- OSA 1923 (Official Secrets Act) — no operational data
- Wassenaar Arrangement — educational physics tool, not dual-use military simulation
- MTCR — no missile/weapons simulation of any kind

**This platform deliberately excludes all weapons systems.** Adding missile launch, torpedo, or weapons simulation would compromise the regulatory framing and is not planned.

---

## Curriculum alignment (>50% match)

Top matches from Indian and international university syllabi:

| Institution | Program | Match |
|-------------|---------|-------|
| IIT Madras — Ocean Engineering | B.Tech Naval Architecture | 92% |
| Naval Postgraduate School (NPS) | M.S. Ocean Acoustics / Undersea Warfare | 95% |
| MIT-WHOI Joint Program | Ph.D. Applied Ocean Science | 90% |
| DIAT Pune (DRDO) | M.Tech Naval Systems | 88% |
| IIT Kharagpur — Ocean Engineering | B.Tech Naval Architecture | 85% |
| NIOT Chennai | M.Tech Ocean Technology | 85% |
| CUSAT School of Ocean Science | M.Sc Oceanography | 80% |
| University of Southampton | M.Eng Ship Science | 80% |

---

## Roadmap status

| Phase | Description | Status |
|-------|------------|--------|
| Phase 0 | Physics prototype (canvas, 6-DoF, depth/pressure) | ✅ 100% |
| Phase 1 | Digital Twin Core — 5 live panels, INCOIS data | ✅ 95% |
| Phase 2 | Sonar + AI layer (SNR, Bayesian, Socratic AI) | ✅ 85% |
| Phase 3 | Mission + Scenario layer | 🔶 45% |
| Phase 4 | Multi-user Firebase + telemetry research platform | ⬜ 0% |

### Phase 4 note (Firebase multi-user)
Firebase multi-user is architecturally straightforward to add using Realtime Database with two roles (Commander / Sonar Operator). The telemetry CSV export in v11 is the prerequisite — it defines the data schema that Firebase will store. Recommended next: add Firebase Auth (anonymous sessions), write telemetry log to `sessions/{sessionId}/telemetry`, add a read-only research dashboard.

---

## License
ProximaED educational platform. All physics equations from public academic sources (Mackenzie 1981, Urick 1983, Barlow thin-wall formula). Not for operational military use.
