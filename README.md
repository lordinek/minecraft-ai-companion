# minecraft-ai-companion

A Minecraft bot named Kole that you talk to in plain Turkish chat. Tell it to get 10 iron, or to build a small house and then farm some wheat, and it goes and does it in a normal survival world. I made it for my [YouTube channel](https://www.youtube.com/@lordinek).

## How it works

The LLM (Gemini) has one job: turn the chat message into a list of tasks in a fixed JSON format. It never moves the bot. Pathfinding, mining, crafting, farming, building and fighting are all regular code in `bot/src/`, so they behave the same every time and I can test them without the model. LLM calls have a daily limit (`LLM_GUNLUK_LIMIT`) so a chatty session can't run up a bill.

There's also a way to control it with no LLM at all. Right-click the bot and a native in-game dialog opens. The dialog is built from a generated datapack, and its buttons send `/trigger` commands into the same task queue.

The bot also keeps a mood and a fatigue level that change with what happens to it: work, fights, insults. They're saved between restarts. It never refuses a job because of them. By default it stays quiet in chat; `CHAT=1` turns its replies back on.

`mod/` is a small server-side Fabric mod that adds `/kole cagir` and `/kole menu` for every player. `scripts/bekci.js` restarts the bot if it crashes and gives up if it crashes five times in ten minutes.

## Things that broke

- Mineflayer lost items when crafting on the newer protocol, so crafting goes through the server over RCON.
- A third-party block-collecting plugin looped forever when there was no chest and filled the heap in about 8 seconds.
- Double chests and walking through water both needed their own fixes.

## Running it

```bash
cd bot
cp .env.example .env     # set SAHIP (your player name), RCON_PASSWORD, GEMINI_API_KEY
npm install
node scripts/bekci.js
```

The server needs RCON enabled. Building the mod needs JDK 25: `JDK=/path/to/jdk sh mod/derle.sh`.

Code and comments are in Turkish. MIT license.
