# Kole: LLM-Driven Minecraft Companion

An autonomous Minecraft companion bot that takes orders in **natural Turkish chat** and carries them out in a survival world. Chopping, mining, smelting, farming, hunting, cooking, building houses and defending its owner all happen in code. The LLM never moves the bot; it only **translates intent into a structured task queue**.

Built for a YouTube series.

## Architecture

```
player chat ──► beyin.js (Gemini, JSON schema) ──► task queue (gorevler.js)
                       ▲                                  │
                 mood state (ruh.js)                      ▼
                                          skill modules: toplama / maden / uretim /
                                          tarim / yemek / insa / zirh / koruma
                                                          │
right-click menu ──► datapack dialog ──► /trigger ──► same task queue (no LLM)
```

- **LLM as a translator, not a controller.** Gemini turns a sentence like *"get me 10 iron and then build a small house"* into validated JSON tasks. Everything after that is deterministic and testable. A daily call budget (`LLM_GUNLUK_LIMIT`) caps cost.
- **Personality layer.** Mood, fatigue and per-activity counters persist across restarts. The bot's replies change with its mood, but its obedience doesn't.
- **LLM-free control path.** Right-clicking the bot opens a native in-game dialog (generated datapack + invisible `interaction` entity). The buttons fire unsigned `/trigger` commands that feed the same queue.
- **Server-side Fabric mod** (`mod/`): registers `/kole cagir` (call) and `/kole menu` for every player. The bot itself decides who may command it.
- **Supervisor** (`scripts/bekci.js`): restarts the bot after crashes (heap exhaustion, disconnects), with a crash-loop breaker.

## Skills

| Module | What it does |
| --- | --- |
| `toplama.js` | Wood gathering with pathfinding and drop collection |
| `maden.js`, `uretim.js` | Ore search, tool-tier progression (wood → stone → iron pickaxe), crafting and smelting |
| `tarim.js`, `yemek.js` | Tilling, planting, harvesting, bread making, hunting, cooking, self-feeding |
| `insa.js` | Builds 3 tiers of houses, auto-sources materials, flattens terrain, registers protected zones |
| `zirh.js`, `koruma.js` | Auto-equips armor, guards the owner from hostile mobs, self-defense |
| `menu.js` | Datapack-generated dialog UI for no-chat control |

## Engineering notes

Lessons learned while getting Mineflayer to run reliably on a modern server:

- Client-side crafting lost items on new protocol versions, so crafting is delegated to the server over RCON.
- A third-party collect plugin looped forever without a chest and filled the heap in ~8 s. The fix: scoped plugin features plus a crash supervisor.
- Double chests and water/scaffolding pathing each needed a custom fix.

## Run

```bash
cd bot
cp .env.example .env     # set SAHIP (owner name), RCON_PASSWORD, GEMINI_API_KEY
npm install
node scripts/bekci.js    # supervised start
```

Requires a Minecraft server with RCON enabled. The `mod/` jar is optional and needs Fabric + JDK 25 (`JDK=... sh mod/derle.sh`).

## Stack

Node.js · Mineflayer (+ pathfinder, pvp, tool, collectblock) · Google Gemini (`@google/genai`) · RCON · Fabric (Java 25, Mixin)

> Code identifiers and comments are in Turkish.

## License

MIT
