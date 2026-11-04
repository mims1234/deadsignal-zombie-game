# Zombies GenXmims as a Discord Activity

One build, one deploy. The website (zombies.genxmims.org) works exactly as before. Opened inside Discord, the same
pages notice they're in an Activity and:

- sign the player in automatically (one Discord consent prompt the first time, silent after that). This is the same
  account as on the website: both are keyed by the Discord user id.
- keep one co-op session per Activity. Whoever creates a session in the voice channel's Activity owns it. Everyone
  else in that Activity sees it in the co-op lobby ("press JOIN to play or WATCH to spectate"), even when it's
  invite-only. The owner's "who may join mid-run" setting still applies.
- invite through Discord's own invite dialog, open links out through Discord, load avatars through the
  `/discord-cdn` mapping, and show "Playing: <map> - Co-op/Solo/Spectating" on the profile.

How it works (for whoever maintains it): `src/platform/index.ts` holds the mode check, the API helper and the Bearer
token. `src/platform/discord.ts` holds the SDK, loaded only inside Discord. On the server (`server/index.mjs`):
`/api/discord/config`, `/api/discord/token`, `/api/rooms/instance/:id`, and `sessionOf()`, which reads a Bearer
header before the cookie. The socket accepts `/ws?s=<session token>`, and `server/rooms.mjs` tracks `instance`.

---

## Part 1: Discord Developer Portal

Open https://discord.com/developers/applications and pick **the same app the website signs in with** (its
Application ID is `DISCORD_CLIENT_ID` in the VPS's `.env`). Using the same app keeps one account per player.

1. **Activities → Settings → Enable Activities.** Turn it on and accept the prompt.
   *Check:* the Activities section now shows URL Mappings and Art Assets.
2. **Activities → URL Mappings.** Add two rows (the target is a host name with no `https://`):
   | PREFIX | TARGET |
   |---|---|
   | `/` (root mapping) | `zombies.genxmims.org` |
   | `/discord-cdn` | `cdn.discordapp.com` |
   Save. *Check:* both rows are listed.
3. **OAuth2 → Redirects.** Keep `https://zombies.genxmims.org/auth/discord/callback` (the website needs it). The
   Activity's sign-in uses no redirect, so add nothing. Don't touch the Client Secret: the server already has it.
4. **Installation → Installation Contexts.** Tick **Guild Install** and **User Install**. Under Default Install
   Settings, Guild Install needs the `applications.commands` scope.
5. **Entry Point command.** Turning on Activities creates a "Launch" entry point command. Check it under
   **Commands** (or Activities → Settings). If it's missing, turn Activities off and on again.
6. **Art Assets** (optional for testing): a cover image and a short description for the Activity shelf.

## Part 2: VPS (checked on mims-server, 2026-11-05: nothing to change)

How the site is served: Cloudflare -> the Cloudflare Tunnel (`cloudflared`, config `/root/.cloudflared/config.yml`,
`zombies.genxmims.org -> http://127.0.0.1:3061`) -> pm2 app `zombies` (`node --env-file=.env server/index.mjs` in
`/root/mims/deadsignal-zombie-game`). nginx is on the box but not in front of the game.

- **Framing:** neither the tunnel nor Cloudflare adds `X-Frame-Options` or a CSP (checked with
  `curl -sI https://zombies.genxmims.org/`), so Discord can frame the site. If you ever add security headers in the
  Cloudflare dashboard (Rules -> Transform Rules -> Response headers), allow `frame-ancestors https://discord.com
  https://*.discordsays.com`.
- **WebSockets and client address:** the tunnel passes WebSocket upgrades (website co-op already uses them) and sets
  `X-Forwarded-For`; the server trusts it (`trustProxy`).
- **`.env`:** nothing new. The Activity uses the existing `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
- **Deploy:** a push to `main` that passes CI is deployed by `.github/workflows/ci.yml` over SSH, which runs
  `scripts/deploy.sh` on the server. By hand: `ssh mims-server 'cd /root/mims/deadsignal-zombie-game && bash scripts/deploy.sh'`.
- **Verify after the deploy:**
  ```bash
  curl -s https://zombies.genxmims.org/api/discord/config
  ```
  It should return `{"clientId":"<your application id>"}`. A 404 means the new version isn't live yet.

## Part 3: Test in Discord

1. Discord → User Settings → Advanced → **Developer Mode** on.
2. Install the app on a test server: Developer Portal → Installation → copy the install link → open it → pick the
   server.
3. Join a voice channel there → the **rocket (Activities)** button → pick the app. Members of your Developer Team see
   it straight away. Add other people under **App Testers** (or the Team) so they see it too.
4. What should happen:
   - The loading screen shows CONNECTING TO DISCORD, then SIGNING IN WITH DISCORD (a consent prompt the first time),
     then the title screen with your Discord name and avatar.
   - **Mouse look:** click Deploy and move the mouse. If you get "POINTER LOCK WAS BLOCKED", tell Claude: a fallback
     still has to be added for that case. It's untested whether Discord's frame allows pointer lock.
   - **Co-op:** one person opens CO-OP → CREATE SESSION. A second person launches the Activity in the same voice
     channel, opens CO-OP, and the code fills in by itself → JOIN or WATCH. INVITE FRIENDS opens Discord's invite
     dialog.
   - **Phone:** the Discord mobile app → the same voice channel → Activities. Touch controls start automatically.
5. If something fails: in the Discord desktop app, Ctrl+Shift+I opens the console (Developer Mode on). Messages
   starting with `[discord]` show what failed. On the VPS, `pm2 logs zombies` shows token exchange errors.

## Part 4: Making it public (later)

While in development, only the Team and App Testers see the Activity. To let anyone use it, go to the Developer
Portal's **Discovery** page. Fill in the listing and turn the Activity on for everyone. Discord may require app
verification first; the portal shows the current requirements there. Discord's docs:
https://discord.com/developers/docs/activities/overview
