import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Cookie, CookieJar } from 'tough-cookie';
import { allowZaloCookieDomain } from './cookie-host.mjs';

allowZaloCookieDomain();

test('keeps a chat.zalo.me cookie set by an id.zalo.me response', async () => {
  const jar = new CookieJar();
  const cookie = Cookie.parse('zpw_sek=abc; Domain=chat.zalo.me; Path=/; Secure');
  await jar.setCookie(cookie, 'https://id.zalo.me/account/authen/qr/waiting-confirm');
  assert.match(await jar.getCookieString('https://chat.zalo.me/'), /zpw_sek=abc/);
});

test('set-cookie with an expiry date stays one cookie', () => {
  const headers = new Headers();
  headers.append('set-cookie', 'zpsid=a; Domain=chat.zalo.me; Path=/');
  headers.append('set-cookie', 'zpw_sek=b; Domain=chat.zalo.me; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT');
  assert.equal(headers.getSetCookie().length, 2);
  assert.ok(headers.get('set-cookie').split(', ').length > 2);
});

test('the Zalo request helper reads getSetCookie', async () => {
  const source = await readFile(new URL('./node_modules/zalo-api-final/dist/utils.js', import.meta.url), 'utf8');
  assert.match(source, /getSetCookie/);
});

test('still accepts a .zalo.me cookie on id.zalo.me', async () => {
  const jar = new CookieJar();
  const cookie = Cookie.parse('_zlang=vn; Domain=.zalo.me; Path=/');
  await jar.setCookie(cookie, 'https://id.zalo.me/');
  assert.match(await jar.getCookieString('https://id.zalo.me/'), /_zlang=vn/);
});
