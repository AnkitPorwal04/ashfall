# ASHFALL: The Last Vigil

An original browser survival arena inspired by the auto-attacking, escalating-horde loop of Vampire Survivors. All sprites, scenery, effects, and synthesized sounds are generated in code. No copied game assets, dependencies, accounts, or API keys.

## Play

Play online: https://ashfall-three.vercel.app

Requires Node.js 20 or newer. Run `npm start` from this directory and open http://localhost:4173. The development server binds to this machine only. You can also deploy the HTML, CSS, and `src/` directory to any static host.

- WASD or arrow keys: move. Attacks fire automatically.
- Space: dash, briefly becoming invulnerable. Watch the cooldown.
- Escape or P: pause and resume. Changing tabs also pauses.
- 1, 2, or 3: choose a level-up reward. Clicking works too.
- Mobile layout: drag the left joystick; tap the right dash button.
- Sound is off initially; enable it with the music button.

Collect glowing souls to level up. Choose one of three randomized rewards, with two rerolls per run. Max a weapon to rank 5 and its paired passive to rank 3 to evolve it automatically. Survive five minutes **and** defeat the Pale Sovereign, who arrives at four minutes, to win.

## What's Included

Three characters with distinct starting weapons and stats. Five weapon families: homing fire, orbiting wisps, radial blades, frost pulses, and lightning. Five evolutions, scaling enemy waves, elites, healing drops, a boss with dodgeable attacks, damage numbers, local best-run storage, and retry/character selection screens.

## Verification

`npm test` runs deterministic engine checks, including all weapon evolutions, projectile collision, boss telegraphs, progression, pause, XP conservation, a heavy-load simulation, and normal-health bot victories for all three characters. Bot runs exercise the engine, not browser rendering or human difficulty.

`npm run check` checks JavaScript syntax.

Browser smoke checks covered desktop and a 390px mobile viewport: character selection, combat, keyboard movement, pointer joystick release, dash cooldown, frozen pause timer, upgrade choices/rerolls, ending/retrying, and returning home. The upgrade UI check used a temporary browser-only XP fixture; it is not shipped in the game. Mobile checks are viewport/pointer emulation, not physical-device testing.

## Scope

This is a compact playable prototype, not a feature-complete Vampire Survivors clone. There is one procedural arena, no permanent unlock economy, multiplayer, save/resume, or imported asset packs. Terrain is decorative, not blocking. Enemy and effect counts are bounded; under severe frame drops simulation time slows rather than jumping forward. Google Fonts is optional, with local font fallbacks. The server is for local development, not a hardened production service.

`src/engine.js` contains the independently testable simulation. `src/game.js` contains the Canvas renderer, original pixel sprites, audio, controls, and UI.

## Deployment

Vercel builds with `node build.mjs` and publishes only `dist/`, containing the four game assets. The local server, tests, and repository files are not published. The Vercel project is connected to the private GitHub repository; pushes to `main` trigger production deployments. The game URL is public, while the repository remains private.
