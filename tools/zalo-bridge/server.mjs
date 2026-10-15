import { timingSafeEqual, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { homedir, networkInterfaces } from 'node:os';
import { LoginQRCallbackEventType, ThreadType, Zalo } from 'zalo-api-final';
import { allowZaloCookieDomain } from './cookie-host.mjs';
import {
  asPoll,
  chunks,
  memberIdsFromGroup,
  peopleFromProfiles,
  pollsForApp,
  voterIdsFromPolls,
  votesFromPolls,
} from './map.mjs';

allowZaloCookieDomain();

const PORT = 3927;
const HOME = path.join(homedir(), '.culong');
const TOKEN_FILE = path.join(HOME, 'zalo-bridge.json');
const CRED_FILE = path.join(HOME, 'zalo.json');
const QR_FILE = path.join(HOME, 'zalo-qr.png');
const WHITELIST_FILE = path.join(HOME, 'zalo-whitelist.json');
const BOARD_POLL = 3;

let token = '';
let api = null;
let accountName = '';
let whitelist = { groups: [] };
let connecting = null;
let loginStopped = false;

// loginQR.js sends sec-ch-ua Chrome 130 and sec-ch-ua-platform Windows.
// The library default userAgent is Firefox, so pass a matching Chrome agent.
const QR_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function createZalo() {
  return new Zalo({ selfListen: false, checkUpdate: true, logging: true });
}

async function saveJson(file, value) {
  await mkdir(HOME, { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function loadToken() {
  const saved = await readJson(TOKEN_FILE);
  if (typeof saved?.token === 'string' && saved.token.length >= 16) {
    console.log(`Token cho app: ${saved.token}`);
    return saved.token;
  }
  const next = randomBytes(24).toString('hex');
  await saveJson(TOKEN_FILE, { token: next });
  console.log(`Token cho app: ${next}`);
  return next;
}

// Whitelist functions
async function loadWhitelist() {
  const saved = await readJson(WHITELIST_FILE);
  whitelist = saved || { groups: [] };
  console.log(`Whitelist loaded: ${whitelist.groups.length} nhóm được phép`);
  if (whitelist.groups.length > 0) {
    console.log('Nhóm được phép:', whitelist.groups.join(', '));
  }
}

async function saveWhitelist() {
  await saveJson(WHITELIST_FILE, whitelist);
}

function isGroupAllowed(groupId) {
  if (!whitelist.groups || whitelist.groups.length === 0) return true; // Allow all if whitelist is empty
  return whitelist.groups.includes(groupId);
}

async function addToWhitelist(groupId, groupName) {
  if (!whitelist.groups) whitelist.groups = [];
  if (!whitelist.groups.includes(groupId)) {
    whitelist.groups.push(groupId);
    await saveWhitelist();
    console.log(`Added group to whitelist: ${groupId} (${groupName || 'unknown'})`);
  }
}

async function removeFromWhitelist(groupId) {
  if (whitelist.groups) {
    whitelist.groups = whitelist.groups.filter(id => id !== groupId);
    await saveWhitelist();
    console.log(`Removed group from whitelist: ${groupId}`);
  }
}

async function clearWhitelistData() {
  whitelist = { groups: [] };
  await saveWhitelist();
  console.log('Whitelist cleared');
}

function lanAddresses() {
  const ips = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) ips.push(entry.address);
    }
  }
  return ips;
}

function authorized(header) {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const want = Buffer.from(token);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
}

function showQr(file) {
  console.log(`Quét QR: ${file}`);
  if (process.platform !== 'darwin') return;
  const child = spawn('open', [file], { stdio: 'ignore', detached: true });
  child.unref();
}

async function loginWithCredentials(saved) {
  const zalo = createZalo();
  return zalo.login({
    imei: saved.imei,
    cookie: saved.cookie,
    userAgent: saved.userAgent,
    language: saved.language || 'vi',
  });
}

async function loginWithQr() {
  const zalo = createZalo();
  let creds = null;
  const next = await zalo.loginQR({ userAgent: QR_USER_AGENT, qrPath: QR_FILE, language: 'vi' }, (event) => {
    if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
      event.actions
        .saveToFile(QR_FILE)
        .then(() => showQr(QR_FILE))
        .catch((error) => console.log('Không lưu được QR:', error?.message || error));
    } else if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
      accountName = event.data?.display_name || accountName;
      console.log(`Đã quét: ${accountName || 'Zalo'}. Trên điện thoại bấm Xác nhận.`);
    } else if (event.type === LoginQRCallbackEventType.QRCodeExpired) {
      console.log('QR hết hạn, đang tạo lại.');
      event.actions.retry();
    } else if (event.type === LoginQRCallbackEventType.QRCodeDeclined) {
      console.log('Bạn từ chối QR.');
    } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
      creds = event.data;
    }
  });
  if (creds) {
    await saveJson(CRED_FILE, { ...creds, displayName: accountName, language: 'vi' });
  }
  return next;
}

async function connect() {
  const saved = await readJson(CRED_FILE);
  if (saved?.imei && saved?.cookie && saved?.userAgent) {
    try {
      const next = await loginWithCredentials(saved);
      accountName = saved.displayName || accountName;
      console.log(`Đã vào lại phiên${accountName ? `: ${accountName}` : ''}.`);
      return next;
    } catch (error) {
      console.log(`Phiên cũ không vào được (${error?.message || error}). Quét QR lại.`);
    }
  }
  return loginWithQr();
}

function kickLogin() {
  if (loginStopped || api || connecting) return connecting;
  connecting = connect()
    .then((next) => {
      api = next;
      return next;
    })
    .catch((error) => {
      loginStopped = true;
      console.log('Đăng nhập lỗi:', error?.message || error);
      if (String(error?.message || error).includes("Can't login")) {
        console.log('QR đã xác nhận. Zalo chưa cấp phiên chat. Chạy lại npm run zalo và quét QR mới.');
      } else {
        console.log('Chạy lại npm run zalo để quét một QR mới.');
      }
      return null;
    })
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

async function liveApi() {
  if (!api) {
    void kickLogin();
    return null;
  }
  try {
    await api.getOwnId();
    return api;
  } catch (error) {
    console.log('Phiên hết hạn:', error?.message || error);
    api = null;
    kickLogin();
    return null;
  }
}

async function listGroups(client) {
  const all = await client.getAllGroups();
  const ids = Object.keys(all?.gridVerMap ?? {});
  const groups = [];
  for (const chunk of chunks(ids, 40)) {
    const info = await client.getGroupInfo(chunk);
    for (const [id, group] of Object.entries(info?.gridInfoMap ?? {})) {
      groups.push({
        id,
        name: String(group?.name || id),
        totalMember: Number(group?.totalMember ?? 0),
      });
    }
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return groups;
}

async function groupMembers(client, groupId) {
  if (!isGroupAllowed(groupId)) {
    const error = new Error('Nhóm không có trong whitelist');
    error.status = 403;
    throw error;
  }
  const info = await client.getGroupInfo(groupId);
  const group = info?.gridInfoMap?.[groupId];
  if (!group) {
    const error = new Error('Không thấy nhóm');
    error.status = 404;
    throw error;
  }
  const { ids, weird } = memberIdsFromGroup(group);
  if (weird) console.log('memVerList có phần tử lạ, không xóa contact cũ.');
  let complete = !weird;
  if (!ids.length && Number(group.totalMember ?? 0) > 0) complete = false;
  const profiles = {};
  for (const chunk of chunks(ids, 100)) {
    try {
      const response = await client.getGroupMembersInfo(chunk);
      Object.assign(profiles, response?.profiles ?? {});
    } catch (error) {
      complete = false;
      console.log('Thiếu một cụm thành viên:', error?.message || error);
    }
  }
  return { people: peopleFromProfiles(profiles), complete };
}

async function groupVotes(client, groupId) {
  if (!isGroupAllowed(groupId)) {
    const error = new Error('Nhóm không có trong whitelist');
    error.status = 403;
    throw error;
  }
  const polls = [];
  let detailsOk = true;
  for (let page = 1; page <= 5; page += 1) {
    const board = await client.getListBoard({ page, count: 20 }, groupId);
    const items = board?.items ?? [];
    if (!items.length) break;
    for (const item of items) {
      if (Number(item?.boardType) !== BOARD_POLL) continue;
      const preview = asPoll(item.data) ?? item?.data;
      const pollId = preview?.poll_id;
      if (!pollId) continue;
      try {
        const detail = asPoll(await client.getPollDetail(String(pollId))) ?? preview;
        polls.push(detail);
      } catch (error) {
        detailsOk = false;
        console.log(`Không đọc được phiếu ${pollId}:`, error?.message || error);
        if (preview) polls.push(preview);
      }
    }
    if (items.length < 20) break;
  }
  const voterIds = voterIdsFromPolls(polls);
  let complete = detailsOk && voterIds.length > 0;
  const profiles = {};
  for (const chunk of chunks(voterIds, 100)) {
    try {
      const response = await client.getGroupMembersInfo(chunk);
      Object.assign(profiles, response?.profiles ?? {});
    } catch (error) {
      complete = false;
      console.log('Thiếu hồ sơ người trong phiếu:', error?.message || error);
    }
  }
  const people = peopleFromProfiles(profiles);
  const nameById = new Map(people.map((person) => [person.id, person.name]));
  return {
    votes: votesFromPolls(polls, nameById),
    polls: pollsForApp(polls, nameById),
    people,
    complete,
  };
}

function groupIdOf(url) {
  const match = /^\/groups\/([^/]+)\/(members|votes)$/.exec(url.pathname);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return { id, kind: match[2] };
}

async function handleCreatePoll(client, body) {
  const { groupId, question, options } = body;
  if (!groupId || !question || !Array.isArray(options) || options.length < 2) {
    throw new Error('Thiếu thông tin poll');
  }
  
  if (!isGroupAllowed(groupId)) {
    throw new Error('Nhóm không có trong whitelist. Dùng tab ⚙ để thêm nhóm.');
  }
  
  const pollOptions = options.map(opt => String(opt).trim()).filter(opt => opt.length > 0);
  if (pollOptions.length < 2) {
    throw new Error('Cần ít nhất 2 ngày để tạo poll');
  }
  
  // Limit options to 20
  const limitedOptions = pollOptions.slice(0, 20);
  if (pollOptions.length > 20) {
    console.log(`Warning: ${pollOptions.length} options, using first 20`);
  }
  
  console.log(`Creating poll "${question}" with ${limitedOptions.length} options`);
  
  try {
    const result = await client.createPoll({
      question: String(question).trim(),
      options: limitedOptions,
      allowAddNewOption: false,
      isAnonymous: false,
    }, groupId);
    
    return { ok: true, pollId: result?.pollId, message: 'Đã tạo poll thành công' };
  } catch (error) {
    console.log('Zalo API error:', error?.message || error);
    throw error;
  }
}

async function handleSendBankCard(client, body) {
  const { groupId, bank, accountNumber, accountName } = body;
  if (!groupId) {
    throw new Error('Thiếu groupId');
  }
  if (!isGroupAllowed(groupId)) {
    throw new Error('Nhóm không có trong whitelist. Dùng tab ⚙ để thêm nhóm.');
  }
  if (!bank || !bank.trim()) {
    throw new Error('Thiếu mã ngân hàng (binBank)');
  }
  if (!accountNumber || !accountNumber.trim()) {
    throw new Error('Thiếu số tài khoản');
  }
  
  console.log(`Sending bank card to group ${groupId}: ${bank} ${accountNumber}`);
  
  try {
    const result = await client.sendBankCard({
      binBank: bank.trim().toUpperCase(),
      numAccBank: accountNumber.trim(),
      nameAccBank: (accountName || '').trim().toUpperCase(),
    }, groupId, ThreadType.Group);
    
    return { ok: true, message: 'Đã gửi thông tin ngân hàng', msgId: result?.msgId };
  } catch (error) {
    console.log('Send bank card error:', error?.message || error);
    throw new Error(`Zalo: ${error?.message || 'Lỗi gửi thông tin ngân hàng'}`);
  }
}

async function handleSendMessage(client, body) {
  const { groupId, message } = body;
  if (!groupId) {
    throw new Error('Thiếu groupId');
  }
  
  if (!isGroupAllowed(groupId)) {
    throw new Error('Nhóm không có trong whitelist. Dùng tab ⚙ để thêm nhóm.');
  }
  
  if (!message || !message.trim()) {
    throw new Error('Thiếu nội dung tin nhắn');
  }
  
  console.log(`Sending message to group ${groupId}, length: ${message.length}`);
  
  try {
    const result = await client.sendMessage({
      msg: message.trim().slice(0, 2000), // Limit to 2000 chars
    }, groupId, ThreadType.Group);
    
    return { ok: true, message: 'Đã gửi', msgId: result?.message?.msgId };
  } catch (error) {
    console.log('Send error:', error?.message || error);
    // Return error message for debugging
    throw new Error(`Zalo: ${error?.message || 'Lỗi gửi tin nhắn'}`);
  }
}

async function handle(req, res) {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  
  // Handle POST /polls (create poll)
  if (req.method === 'POST' && url.pathname === '/polls') {
    if (!authorized(req.headers.authorization)) {
      send(res, 401, { ok: false, error: 'Sai token' });
      return;
    }
    const client = await liveApi();
    if (!client) {
      send(res, 401, { ok: false, needLogin: true, error: 'Cần quét QR trên Mac' });
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const result = await handleCreatePoll(client, body);
      send(res, 200, result);
    } catch (error) {
      send(res, 400, { ok: false, error: error?.message || 'Lỗi tạo poll' });
    }
    return;
  }
  
  // Handle POST /send-bank (send bank card to group)
  if (req.method === 'POST' && url.pathname === '/send-bank') {
    if (!authorized(req.headers.authorization)) {
      send(res, 401, { ok: false, error: 'Sai token' });
      return;
    }
    const client = await liveApi();
    if (!client) {
      send(res, 401, { ok: false, needLogin: true, error: 'Cần quét QR trên Mac' });
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const result = await handleSendBankCard(client, body);
      send(res, 200, result);
    } catch (error) {
      send(res, 400, { ok: false, error: error?.message || 'Lỗi gửi thông tin ngân hàng' });
    }
    return;
  }
  
  // Handle POST /send (send message to group)
  if (req.method === 'POST' && url.pathname === '/send') {
    if (!authorized(req.headers.authorization)) {
      send(res, 401, { ok: false, error: 'Sai token' });
      return;
    }
    const client = await liveApi();
    if (!client) {
      send(res, 401, { ok: false, needLogin: true, error: 'Cần quét QR trên Mac' });
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const result = await handleSendMessage(client, body);
      send(res, 200, result);
    } catch (error) {
      send(res, 400, { ok: false, error: error?.message || 'Lỗi gửi tin nhắn' });
    }
    return;
  }
  
  // Whitelist management endpoints - must be before GET check
  if (url.pathname === '/whitelist') {
    if (!authorized(req.headers.authorization)) {
      send(res, 401, { ok: false, error: 'Sai token' });
      return;
    }
    if (req.method === 'GET') {
      send(res, 200, {
        ok: true,
        groups: whitelist?.groups || [],
        isEmpty: !whitelist?.groups?.length,
      });
      return;
    }
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { groupId, groupName } = body;
      if (!groupId) {
        send(res, 400, { ok: false, error: 'Thiếu groupId' });
        return;
      }
      await addToWhitelist(groupId, groupName || groupId);
      send(res, 200, {
        ok: true,
        message: 'Đã thêm nhóm vào whitelist',
        groups: whitelist?.groups || [],
      });
      return;
    }
  }
  
  // POST /whitelist/remove/:groupId
  const whitelistRemoveMatch = /^\/whitelist\/remove\/([^/]+)$/.exec(url.pathname);
  if (whitelistRemoveMatch && req.method === 'POST') {
    if (!authorized(req.headers.authorization)) {
      send(res, 401, { ok: false, error: 'Sai token' });
      return;
    }
    const groupId = decodeURIComponent(whitelistRemoveMatch[1]);
    await removeFromWhitelist(groupId);
    send(res, 200, {
      ok: true,
      message: 'Đã xóa nhóm khỏi whitelist',
      groups: whitelist?.groups || [],
    });
    return;
  }
  
  // POST /whitelist/clear
  if (url.pathname === '/whitelist/clear' && req.method === 'POST') {
    if (!authorized(req.headers.authorization)) {
      send(res, 401, { ok: false, error: 'Sai token' });
      return;
    }
    await clearWhitelistData();
    send(res, 200, {
      ok: true,
      message: 'Đã xóa toàn bộ whitelist',
      groups: [],
    });
    return;
  }
  
  if (req.method !== 'GET') {
    send(res, 405, { ok: false, error: 'Chỉ hỗ trợ GET' });
    return;
  }
  if (!authorized(req.headers.authorization)) {
    send(res, 401, { ok: false, error: 'Sai token' });
    return;
  }
  if (url.pathname === '/health') {
    const client = await liveApi();
    if (!client) {
      send(res, 401, { ok: false, needLogin: true, error: 'Cần quét QR trên Mac' });
      return;
    }
    send(res, 200, { ok: true, loggedIn: true, accountName });
    return;
  }
  const client = await liveApi();
  if (!client) {
    send(res, 401, { ok: false, needLogin: true, error: 'Cần quét QR trên Mac' });
    return;
  }
  try {
    if (url.pathname === '/groups') {
      send(res, 200, { ok: true, groups: await listGroups(client) });
      return;
    }
    const target = groupIdOf(url);
    if (!target) {
      send(res, 404, { ok: false, error: 'Không có đường dẫn này' });
      return;
    }
    if (target.kind === 'members') {
      send(res, 200, { ok: true, ...(await groupMembers(client, target.id)) });
      return;
    }
    send(res, 200, { ok: true, ...(await groupVotes(client, target.id)) });
  } catch (error) {
    const status = error?.status === 404 ? 404 : 500;
    send(res, status, { ok: false, error: error?.message || 'Lỗi Zalo' });
  }
}

token = await loadToken();
await loadWhitelist();
const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.log(error);
    if (!res.headersSent) send(res, 500, { ok: false, error: 'Lỗi bridge' });
  });
});
server.listen(PORT, '0.0.0.0', () => {
  const hosts = lanAddresses();
  console.log(hosts.length ? `Nghe cổng ${PORT}: ${hosts.map((ip) => `http://${ip}:${PORT}`).join(', ')}` : `Nghe cổng ${PORT}`);
  kickLogin();
});
