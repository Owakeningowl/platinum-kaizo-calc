# Platinum Kaizo calc with a live save link

Unofficial copy of the [Platinum Kaizo Damage Calculator](https://pkcalc.anastarawneh.com/) by anastarawneh,
with one change: its Sync (Lua) and Upload Save are replaced by **Link save**, which keeps Team / Box
updated from your save without a Lua script. Everything else (the calculator, trainer sets, dex, settings)
loads straight from the official site, so it stays current.

Live: <https://owakeningowl.github.io/platinum-kaizo-calc/>

## Using it with DeSmuME on a Mac

1. A background job copies DeSmuME's Platinum Kaizo save and save states to `~/PK Saves/`
   (Chrome won't let pages open files inside `~/Library`, where DeSmuME keeps them).
2. In the calc's Team / Box panel, click **Link save** and pick `~/PK Saves/PK Latest.dat` once
   (in the file picker press Cmd+Shift+G and type `~/PK Saves`).
3. From then on the calc re-reads it every couple of seconds: each in-game save or save state
   puts your party in Team and your PC in Box.

**Load save file** reads a `.sav`, `.dsv` or DeSmuME save state once, in any browser.
The save is read in the page and never uploaded.

Settings and imported sets from the official site don't carry over (a different web address keeps its
own storage), so pick your trainer and starter in Settings again once.

## Rebuilding

`python3 tools/build.py` re-takes the live page. `js/pk-save-link.js` reads `.sav` / `.dsv` files and
DeSmuME save states (Platinum Kaizo, game code JAK7) and hands every Pokémon to the calculator's own
`addSavePokemon()`, the same function its Upload Save used.
