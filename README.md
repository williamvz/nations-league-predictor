# 🏆 Nations League Pool 2026/27

A prediction-pool app for the **UEFA Nations League 2026/27 (League A)** — the successor to [Pepijn's World Cup app](https://github.com/williamvz/pepijns-world-cup-prediction-app), rebuilt to be **maintenance-free**: match results, live scores, standings, top scorers and bonus questions all update automatically. Nobody has to type in a single result.

Runs as a **Home Assistant add-on** on a Raspberry Pi (or standalone with Docker). Dutch UI, mobile-first PWA.

## ✨ What's new compared to the World Cup app

| | WK Pool 2026 | Nations League Pool |
|---|---|---|
| Results entry | 100+ manual admin entries | **Fully automatic** (ESPN + TheSportsDB) |
| Live scores | ✗ | ✅ every 2 min during matches, live leaderboard |
| Standings | internal only | ✅ live group tables with UEFA tie-breakers, form, insights |
| Top scorers | manual free-text bonus | ✅ synced per-goal, auto-resolved bonus question |
| Bonus grading | fragile string compare | ✅ automatic (standings/scorer based) |
| HA ingress | broken (absolute paths) | ✅ works — relative assets + hash routing |
| Timezones | countdowns drifted abroad | ✅ everything pinned to Europe/Amsterdam |
| Extra | — | 🃏 joker (×2, 1 per matchday), rank-history bump chart, head-to-head compare, community stats, 16 achievements (all actually attainable), open self-registration with in-app admin approval (invite code = skip the queue) |

## 🏠 Install on Home Assistant (Raspberry Pi 5)

> The add-on repository route requires this GitHub repo to be **public**. If you want to keep it private, use the local add-on route below.

**Route A — add-on repository (recommended):**

1. In Home Assistant: **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
2. Add `https://github.com/williamvz/nations-league-predictor`
3. Install **Nations League Pool** (first build takes ~5–10 min on a Pi 5 — it compiles the frontend and SQLite bindings locally)
4. In the add-on **Configuration** tab set:
   - `jwt_secret` — long random string (`openssl rand -hex 32`)
   - `admin_password` — optional; auto-generated and printed in the log if empty
   - `invite_code` — optional; anyone can register (you approve them in-app), but this code skips the approval queue
5. **Start** → open **NL Pool** in the sidebar, or share `http://<pi-ip>:8099` with friends (Add to Home Screen = app experience)

**Route B — local add-on (private repo):**

Copy the `nations-league-pool/` folder to your Pi's `/addons` share (Samba add-on), then **Add-on Store → ⋮ → Check for updates**. It appears under *Local add-ons*.

Database lives at `/data/nlpool.db` inside the add-on → covered by normal HA backups.

## 🐳 Standalone (without Home Assistant)

```bash
cp .env.example .env   # set JWT_SECRET (required) + ADMIN_PASSWORD
docker compose up -d --build
# → http://localhost:8099
```

## ⚙️ How the automation works

```
node-cron (in-process, Europe/Amsterdam)
├─ every 2 min   — only while a match is live or starts <30 min: live scores, minute, goals
├─ every 20 min  — safety sweep: any missed final results
├─ daily 05:30   — fixture calendar sync (kickoff changes, postponements)
└─ at boot       — catch-up for everything missed while the Pi was off
```

- **Primary source:** ESPN public API (scores, live minute, goal scorers)
- **Fallback:** TheSportsDB (scores + schedule)
- Team names are matched via normalized aliases (`Türkiye`/`Turkey`, `Czechia`/`Czech Republic`, …); provider match-IDs are remembered after first contact.
- When a match finishes: points are recalculated idempotently, users get a notification, the matchday is finalized (leaderboard snapshot → rank-movement achievements, day-winner announcement) and bonus questions resolve themselves (group winners, Netherlands points, top scorer).
- Every sync is logged; **Beheer → Status** shows health + a manual sync button. Manual results always win over providers.

## 📊 Scoring

| Prediction | Points |
|---|---|
| Exact score | **5** |
| Correct winner + goal difference | **3** |
| Correct winner (or draw) | **2** |
| 🃏 Joker (one per matchday) | **×2** |

Bonus: group winners (4 × 5 pts), league-phase top scorer (5 pts), Netherlands' group-stage points total (5 pts, ±1 → 2 pts). Knockout stages (March/June 2027) use multipliers ×1.5–×2.5 and can be added when the time comes.

## 🧱 Stack & repo layout

```
repository.yaml            # HA add-on repository manifest
nations-league-pool/       # the add-on (= the whole app)
├─ config.yaml             # HA add-on config (ingress, ports, options)
├─ Dockerfile              # multi-stage: build frontend → slim runtime
├─ run.sh                  # reads HA options, starts server
├─ backend/                # Express + better-sqlite3 + node-cron
│  ├─ src/db/              # schema, seed (48 real fixtures), tournament data
│  ├─ src/routes/          # REST API (auth, predictions, leaderboard, …)
│  ├─ src/services/        # scoring, standings, achievements, bonus, notify
│  ├─ src/sync/            # providers (ESPN, TheSportsDB), matcher, scheduler
│  └─ test/                # node:test suite (scoring, standings, e2e flow)
└─ frontend/               # React 18 + Vite + Tailwind PWA (Dutch)
```

Dev: `cd nations-league-pool/backend && npm i && JWT_SECRET=dev npm run dev`, then `cd ../frontend && npm i && npm run dev` (Vite proxies `/api`). Tests: `npm test` in `backend/`.

---

Gemaakt met ❤️ voor de pool · Hup Holland Hup! 🇳🇱
