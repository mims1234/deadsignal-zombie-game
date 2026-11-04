/**
 * The Discord Activity side (loaded only inside Discord, so the website never downloads the SDK): the handshake, the
 * sign-in, and the Discord features the game uses (invites, links out, presence).
 *
 * Sign-in: the SDK's `authorize` gives a code (a consent prompt the first time, silent after), the server exchanges it
 * with Discord and signs the player in to the same account the website uses (both are keyed by the Discord user id),
 * and answers with Discord's access token (for `authenticate`) and the game's own session token.
 */
import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { apiFetch, setSessionToken, storedSessionToken, type DiscordBridge } from './index';

/** Avatars come from Discord's CDN, which the Activity reaches through this URL mapping (set in the Developer Portal). */
const CDN_MAPPING = { prefix: '/discord-cdn', target: 'cdn.discordapp.com' };

async function exchange(code: string): Promise<{ access_token: string; session_token: string } | null> {
  const r = await apiFetch('/api/discord/token', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds': '1' }, body: JSON.stringify({ code }) });
  if (!r.ok) {
    console.warn('[discord] token exchange failed', r.status, await r.text().catch(() => ''));
    return null;
  }
  return (await r.json()) as { access_token: string; session_token: string };
}

export async function connectDiscord(onStatus: (msg: string) => void): Promise<DiscordBridge | null> {
  // the cdn.discordapp.com avatar addresses the server sends, rewritten to the mapping (the Activity's CSP only lets
  // mapped hosts load)
  patchUrlMappings([CDN_MAPPING], { patchFetch: true, patchWebSocket: false, patchXhr: false, patchSrcAttributes: true });

  const cfg = (await (await apiFetch('/api/discord/config')).json()) as { clientId?: string };
  if (!cfg.clientId) {
    console.warn('[discord] the server has no DISCORD_CLIENT_ID');
    return null;
  }
  const sdk = new DiscordSDK(cfg.clientId);
  onStatus('CONNECTING TO DISCORD');
  // Discord answers at once inside an Activity; a page with frame_id that is not in one would wait forever
  const timedOut = await Promise.race([sdk.ready().then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 15000))]);
  if (timedOut) {
    console.warn('[discord] no answer from Discord: starting signed out');
    return null;
  }

  // a reload in the same Activity (a map change): the session from before still works, no new consent
  const kept = storedSessionToken();
  let signedIn = false;
  let canPresence = false;
  if (kept) {
    setSessionToken(kept);
    const me = await apiFetch('/api/me').then((r) => (r.ok ? r.json() : null)).catch(() => null) as { user?: unknown } | null;
    signedIn = !!me?.user;
    if (!signedIn) setSessionToken(null);
  }
  if (!signedIn) {
    onStatus('SIGNING IN WITH DISCORD');
    // presence needs rpc.activities.write; should Discord refuse that scope, sign in with identify alone
    let code: string | null = null;
    for (const scope of [['identify', 'rpc.activities.write'], ['identify']] as const) {
      try {
        code = (await sdk.commands.authorize({ client_id: cfg.clientId, response_type: 'code', state: '', prompt: 'none', scope: [...scope] })).code;
        canPresence = scope.length > 1;
        break;
      } catch (err) {
        console.warn('[discord] authorize', scope, err);
      }
    }
    const tokens = code ? await exchange(code) : null;
    if (tokens) {
      setSessionToken(tokens.session_token);
      signedIn = true;
      try {
        await sdk.commands.authenticate({ access_token: tokens.access_token });
      } catch (err) {
        canPresence = false;
        console.warn('[discord] authenticate', err);
      }
    }
  }

  // links out: an iframe cannot open a tab, Discord opens it (after asking the player)
  document.addEventListener(
    'click',
    (ev) => {
      const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, location.href);
      if (url.origin === location.origin) return;
      ev.preventDefault();
      void sdk.commands.openExternalLink({ url: url.href }).catch(() => {});
    },
    true,
  );

  return {
    instanceId: sdk.instanceId,
    invite: () => void sdk.commands.openInviteDialog().catch((err) => console.warn('[discord] invite', err)),
    openExternal: (url) => void sdk.commands.openExternalLink({ url }).catch(() => {}),
    presence: (details, state) => {
      // after a reload the scope is not known again: try, and let Discord refuse
      if (!canPresence && !kept) return;
      void sdk.commands.setActivity({ activity: { type: 0, details, state } }).catch(() => {});
    },
  };
}
