#!/usr/bin/env node
// Thêm log chẩn đoán vào zalo-api-final trước khi ném lỗi "Can't login".
// Bản npm không log gì khi đăng nhập thất bại nên không biết nguyên nhân.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, 'node_modules', 'zalo-api-final', 'dist', 'apis', 'loginQR.js');

const NEEDLE = 'if (!userInfo.data.logged)\n                return reject(new ZaloApiError("Can\'t login"));';
const PATCH = `if (!userInfo.data.logged) {
                const d = userInfo.data;
                console.log("[zalo-diag] logged=" + Boolean(d.logged) +
                    " require_confirm_pwd=" + Boolean(d.require_confirm_pwd) +
                    " session_chat_valid=" + Boolean(d.session_chat_valid) +
                    " account_domain=" + (d.account_domain ? "có" : "không") +
                    " keys=" + Object.keys(d).join(","));
                return reject(new ZaloApiError("Can't login"));
            }`;

if (!existsSync(target)) {
  console.error('[zalo-diag] không thấy', target, '- chạy npm install trước.');
  process.exit(1);
}

const src = readFileSync(target, 'utf8');

if (src.includes('[zalo-diag]')) {
  console.log('[zalo-diag] đã patch rồi, bỏ qua.');
  process.exit(0);
}

if (!src.includes(NEEDLE)) {
  console.error('[zalo-diag] không khớp mẫu cần patch. Phiên bản thư viện có thể đã đổi.');
  process.exit(1);
}

writeFileSync(target, src.replace(NEEDLE, PATCH));
console.log('[zalo-diag] đã thêm log chẩn đoán vào zalo-api-final.');