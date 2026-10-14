import { CookieJar } from 'tough-cookie';

// id.zalo.me answers with Set-Cookie Domain=chat.zalo.me. tough-cookie rejects
// that pair. Store the cookie on its own host, same as current zca-js request().
export function cookieStoreUrl(cookie, url) {
  const domain =
    cookie && typeof cookie === 'object' && cookie.domain
      ? String(cookie.domain).replace(/^\./, '')
      : '';
  if (!domain || domain === 'zalo.me') return url;
  let host = '';
  try {
    host = new URL(String(url)).hostname;
  } catch {
    return url;
  }
  if (host === domain || host.endsWith(`.${domain}`)) return url;
  return `https://${domain}`;
}

export function allowZaloCookieDomain() {
  const setCookie = CookieJar.prototype.setCookie;
  CookieJar.prototype.setCookie = function (cookie, url, options, callback) {
    return setCookie.call(this, cookie, cookieStoreUrl(cookie, url), options, callback);
  };
  const setCookieSync = CookieJar.prototype.setCookieSync;
  CookieJar.prototype.setCookieSync = function (cookie, url, options) {
    return setCookieSync.call(this, cookie, cookieStoreUrl(cookie, url), options);
  };
}
