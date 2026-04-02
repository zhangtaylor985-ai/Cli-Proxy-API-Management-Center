const CLIENT_API_KEY_PREFIX = 'sk-';
const CLIENT_API_KEY_BODY_LENGTH = 48;
const CLIENT_API_KEY_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateSecureApiKey(): string {
  let body = '';
  const random = new Uint8Array(CLIENT_API_KEY_BODY_LENGTH * 2);

  while (body.length < CLIENT_API_KEY_BODY_LENGTH) {
    crypto.getRandomValues(random);
    for (const value of random) {
      if (value >= CLIENT_API_KEY_CHARSET.length * 4) continue;
      body += CLIENT_API_KEY_CHARSET[value % CLIENT_API_KEY_CHARSET.length];
      if (body.length === CLIENT_API_KEY_BODY_LENGTH) break;
    }
  }

  return CLIENT_API_KEY_PREFIX + body;
}
