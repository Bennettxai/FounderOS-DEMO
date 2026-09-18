/**
 * The OAuth 2.0 authorization-code registry.
 *
 * A provider is listed here ONLY when it runs a real authorization-code flow
 * we can drive. Everything else on the Connections board keeps the pasted-key
 * path, because a Connect button that cannot complete is worse than an honest
 * "this one takes a key".
 *
 * `redirectKind` is the load-bearing field and the reason this is not simply
 * "OAuth everywhere". The OS answers on a private network host, so the redirect URI it
 * can offer is `http://os-host:4100/api/oauth/callback`:
 *
 *   'any'          - the provider accepts an arbitrary http redirect, so this
 *                    works today with nothing but a client id and secret.
 *   'loopback'     - the provider accepts http ONLY on 127.0.0.1/localhost, so
 *                    it works when the OS is opened at localhost on the box
 *                    itself, and not over the private network hostname.
 *   'https-public' - the provider demands a public https redirect, so it needs
 *                    a tunnel or a real domain in front of the OS first.
 *
 * Nothing here invents an endpoint: every URL is the provider's documented
 * authorize/token pair.
 */

export type RedirectKind = 'any' | 'loopback' | 'https-public';

export type OAuthProvider = {
  /** Matches the Connections catalog slug so the board can join them. */
  slug: string;
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Most providers space-separate; a few want commas. */
  scopeSeparator?: string;
  pkce: boolean;
  redirectKind: RedirectKind;
  /** Where the app's own credentials live, and where the result lands. */
  clientIdEnv: string;
  clientSecretEnv: string;
  accessTokenEnv: string;
  refreshTokenEnv?: string;
  /** Extra authorize params the provider requires (offline access, etc). */
  extraAuthorizeParams?: Record<string, string>;
  /** Some token endpoints want the client id/secret as Basic auth instead. */
  basicAuth?: boolean;
  /** Where the operator registers the app, shown in the UI next to the button. */
  consoleUrl: string;
};

export const OAUTH_PROVIDERS: OAuthProvider[] = [
  {
    slug: 'github',
    name: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:org'],
    pkce: false,
    // GitHub OAuth apps accept any redirect host, loopback and LAN included.
    redirectKind: 'any',
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'GITHUB_OAUTH_TOKEN',
    consoleUrl: 'https://github.com/settings/developers',
  },
  {
    slug: 'google',
    name: 'Google (Gmail, Calendar, Drive)',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
    ],
    pkce: true,
    // Google allows http ONLY for 127.0.0.1/localhost redirects.
    redirectKind: 'loopback',
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'GOOGLE_OAUTH_TOKEN',
    refreshTokenEnv: 'GOOGLE_OAUTH_REFRESH_TOKEN',
    // Without these Google returns no refresh token on re-consent.
    extraAuthorizeParams: { access_type: 'offline', prompt: 'consent' },
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    slug: 'slack',
    name: 'Slack',
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['channels:history', 'channels:read', 'chat:write', 'users:read'],
    scopeSeparator: ',',
    pkce: false,
    redirectKind: 'https-public',
    clientIdEnv: 'SLACK_OAUTH_CLIENT_ID',
    clientSecretEnv: 'SLACK_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'SLACK_BOT_TOKEN',
    consoleUrl: 'https://api.slack.com/apps',
  },
  {
    slug: 'notion',
    name: 'Notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: ['read_content', 'update_content'],
    pkce: false,
    redirectKind: 'https-public',
    basicAuth: true,
    clientIdEnv: 'NOTION_OAUTH_CLIENT_ID',
    clientSecretEnv: 'NOTION_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'NOTION_API_KEY',
    extraAuthorizeParams: { owner: 'user' },
    consoleUrl: 'https://www.notion.so/my-integrations',
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: ['crm.objects.contacts.read', 'crm.objects.deals.read'],
    pkce: false,
    redirectKind: 'https-public',
    clientIdEnv: 'HUBSPOT_OAUTH_CLIENT_ID',
    clientSecretEnv: 'HUBSPOT_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'HUBSPOT_ACCESS_TOKEN',
    refreshTokenEnv: 'HUBSPOT_REFRESH_TOKEN',
    consoleUrl: 'https://developers.hubspot.com/',
  },
  {
    slug: 'linear',
    name: 'Linear',
    authorizeUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    scopes: ['read', 'write'],
    scopeSeparator: ',',
    pkce: false,
    redirectKind: 'https-public',
    clientIdEnv: 'LINEAR_OAUTH_CLIENT_ID',
    clientSecretEnv: 'LINEAR_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'LINEAR_API_KEY',
    consoleUrl: 'https://linear.app/settings/api/applications',
  },
  {
    slug: 'stripe',
    name: 'Stripe Connect',
    authorizeUrl: 'https://connect.stripe.com/oauth/authorize',
    tokenUrl: 'https://connect.stripe.com/oauth/token',
    scopes: ['read_only'],
    pkce: false,
    redirectKind: 'https-public',
    clientIdEnv: 'STRIPE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'STRIPE_SECRET_KEY',
    accessTokenEnv: 'STRIPE_CONNECT_ACCESS_TOKEN',
    refreshTokenEnv: 'STRIPE_CONNECT_REFRESH_TOKEN',
    consoleUrl: 'https://dashboard.stripe.com/settings/connect',
  },
  {
    slug: 'zoom',
    name: 'Zoom',
    authorizeUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    scopes: ['meeting:read', 'recording:read'],
    pkce: true,
    redirectKind: 'https-public',
    basicAuth: true,
    clientIdEnv: 'ZOOM_OAUTH_CLIENT_ID',
    clientSecretEnv: 'ZOOM_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'ZOOM_ACCESS_TOKEN',
    refreshTokenEnv: 'ZOOM_REFRESH_TOKEN',
    consoleUrl: 'https://marketplace.zoom.us/develop/create',
  },
  {
    slug: 'jira',
    name: 'Jira (Atlassian)',
    authorizeUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes: ['read:jira-work', 'write:jira-work', 'offline_access'],
    pkce: false,
    redirectKind: 'https-public',
    clientIdEnv: 'ATLASSIAN_OAUTH_CLIENT_ID',
    clientSecretEnv: 'ATLASSIAN_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'ATLASSIAN_ACCESS_TOKEN',
    refreshTokenEnv: 'ATLASSIAN_REFRESH_TOKEN',
    extraAuthorizeParams: { audience: 'api.atlassian.com', prompt: 'consent' },
    consoleUrl: 'https://developer.atlassian.com/console/myapps/',
  },
  {
    slug: 'vercel',
    name: 'Vercel',
    authorizeUrl: 'https://vercel.com/oauth/authorize',
    tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
    scopes: ['read'],
    pkce: false,
    redirectKind: 'https-public',
    clientIdEnv: 'VERCEL_OAUTH_CLIENT_ID',
    clientSecretEnv: 'VERCEL_OAUTH_CLIENT_SECRET',
    accessTokenEnv: 'VERCEL_ACCESS_TOKEN',
    consoleUrl: 'https://vercel.com/dashboard/integrations/console',
  },
];

export function oauthProviderSlugs(): string[] {
  return OAUTH_PROVIDERS.map((p) => p.slug);
}

export function oauthProvider(slug: string): OAuthProvider | null {
  return OAUTH_PROVIDERS.find((p) => p.slug === slug) ?? null;
}

/** One callback for every provider, so only one URI is ever registered. */
export function redirectUri(base: string): string {
  return `${base.replace(/\/+$/, '')}/api/oauth/callback`;
}

export function authorizeUrl(
  p: OAuthProvider,
  o: { clientId: string; state: string; challenge: string; base: string },
): string {
  const u = new URL(p.authorizeUrl);
  u.searchParams.set('client_id', o.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', redirectUri(o.base));
  u.searchParams.set('scope', p.scopes.join(p.scopeSeparator ?? ' '));
  u.searchParams.set('state', o.state);
  if (p.pkce) {
    u.searchParams.set('code_challenge', o.challenge);
    u.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(p.extraAuthorizeParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

export function tokenRequestBody(
  p: OAuthProvider,
  o: { code: string; clientId: string; clientSecret: string; verifier: string; base: string },
): URLSearchParams {
  const b = new URLSearchParams();
  b.set('grant_type', 'authorization_code');
  b.set('code', o.code);
  b.set('redirect_uri', redirectUri(o.base));
  if (!p.basicAuth) {
    b.set('client_id', o.clientId);
    b.set('client_secret', o.clientSecret);
  } else {
    // Basic-auth providers still want the id in the body for matching.
    b.set('client_id', o.clientId);
  }
  if (p.pkce) b.set('code_verifier', o.verifier);
  return b;
}

export function refreshRequestBody(
  p: OAuthProvider,
  o: { refreshToken: string; clientId: string; clientSecret: string },
): URLSearchParams {
  const b = new URLSearchParams();
  b.set('grant_type', 'refresh_token');
  b.set('refresh_token', o.refreshToken);
  if (!p.basicAuth) {
    b.set('client_id', o.clientId);
    b.set('client_secret', o.clientSecret);
  }
  return b;
}
