// @ts-ignore
import { createRemoteJWKSet, jwtVerify } from '../deps.ts';
// @ts-ignore
import { TENANT_ID, CLIENT_ID } from '../config.ts';

const ENTRA_ISSUER_V2 = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const ENTRA_ISSUER_V1 = `https://sts.windows.net/${TENANT_ID}/`;

const ENTRA_JWKS = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`),
);

export async function verifyAzureToken(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  const raw = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  const issuer = raw.iss?.includes('sts.windows.net') ? ENTRA_ISSUER_V1 : ENTRA_ISSUER_V2;
  const { payload } = await jwtVerify(token, ENTRA_JWKS, {
    issuer,
    audience: `api://${CLIENT_ID}`,
  });
  if (payload['tid'] !== TENANT_ID)
    throw new Error('[API] Token de tenant no autorizado: ' + payload['tid']);
  return payload as Record<string, unknown>;
}