/**
 * Sesiones Telegram (bots) — independiente de Baileys/WhatsApp.
 * Un bot = una sesión. El destino es chat_id (usuario o grupo).
 */
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'telegram.json');
const TG_API = 'https://api.telegram.org';
const GETME_TTL_MS = 60 * 1000;

let bots = []; // { id, label, token, username?, enabled? }
const getMeCache = new Map(); // id -> { ok, username, ts, error? }
const sentToday = new Map(); // id -> { date, sent, failed }

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function bumpStat(id, field) {
  const d = todayStr();
  const cur = sentToday.get(id);
  if (!cur || cur.date !== d) sentToday.set(id, { date: d, sent: 0, failed: 0 });
  sentToday.get(id)[field] += 1;
}

function loadBots() {
  if (!fs.existsSync(CONFIG_PATH)) {
    bots = [];
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    bots = Array.isArray(raw) ? raw.filter((b) => b && b.id && b.token) : [];
  } catch (err) {
    console.warn('[telegram] No se pudo leer telegram.json:', err.message);
    bots = [];
  }
}

function saveBots() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(bots, null, 2), 'utf-8');
}

function maskToken(token) {
  const t = String(token || '');
  if (t.length < 12) return '••••';
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

function findBot(sessionId) {
  if (!sessionId) return null;
  return bots.find((b) => b.id === sessionId && b.enabled !== false) || null;
}

function requireBot(sessionId) {
  const bot = findBot(sessionId);
  if (!bot) throw new Error(`Sesión Telegram ${sessionId} no existe`);
  if (!Array.isArray(bot.chats)) bot.chats = [];
  return bot;
}

function chatSummary(c) {
  return {
    chatId: String(c.chatId),
    label: c.label || String(c.chatId),
    type: c.type || 'unknown',
  };
}

async function rememberChat(bot, chatId) {
  const id = String(chatId).trim();
  if (!id) return;
  if (!Array.isArray(bot.chats)) bot.chats = [];
  if (bot.chats.some((c) => String(c.chatId) === id)) return;
  try {
    const chat = await telegramCall(bot.token, 'getChat', { chat_id: id });
    bot.chats.push({
      chatId: id,
      label: chat.title || chat.username || chat.first_name || id,
      type: chat.type || 'unknown',
    });
  } catch {
    bot.chats.push({ chatId: id, label: id, type: 'unknown' });
  }
  saveBots();
}

async function telegramCall(token, method, payload = null) {
  const url = `${TG_API}/bot${token}/${method}`;
  const opts = payload
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    : { method: 'GET' };
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const desc = data.description || `HTTP ${res.status}`;
    const err = new Error(desc);
    err.telegram = data;
    throw err;
  }
  return data.result;
}

async function refreshGetMe(bot) {
  try {
    const me = await telegramCall(bot.token, 'getMe');
    const username = me.username ? `@${me.username}` : (me.first_name || '');
    getMeCache.set(bot.id, { ok: true, username, ts: Date.now() });
    if (username && bot.username !== username) {
      bot.username = username;
      saveBots();
    }
    return getMeCache.get(bot.id);
  } catch (err) {
    getMeCache.set(bot.id, { ok: false, error: err.message, ts: Date.now() });
    return getMeCache.get(bot.id);
  }
}

export function loadTelegramConfig() {
  loadBots();
  console.log(`[telegram] ${bots.length} bot(s) cargado(s)`);
}

export async function getTelegramSessionsStatus() {
  const list = [];
  for (const b of bots) {
    const cached = getMeCache.get(b.id);
    const stale = !cached || Date.now() - cached.ts > GETME_TTL_MS;
    const info = stale ? await refreshGetMe(b) : cached;
    const st = sentToday.get(b.id);
    const d = todayStr();
    const stats = st && st.date === d ? { sent: st.sent, failed: st.failed } : { sent: 0, failed: 0 };
    list.push({
      id: b.id,
      label: b.label || b.id,
      username: info?.username || b.username || null,
      tokenMasked: maskToken(b.token),
      status: info?.ok ? 'online' : 'offline',
      error: info?.ok ? null : (info?.error || 'Token inválido'),
      stats,
      chatCount: Array.isArray(b.chats) ? b.chats.length : 0,
    });
  }
  return list;
}

export async function addTelegramBot({ label, token }) {
  const tok = String(token || '').trim();
  const lbl = String(label || '').trim() || 'Bot Telegram';
  if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(tok)) {
    throw new Error('Token inválido. Cópialo desde BotFather (formato 123456:AAE...)');
  }
  if (bots.some((b) => b.token === tok)) {
    throw new Error('Ese bot ya está registrado');
  }
  const me = await telegramCall(tok, 'getMe');
  const id = `telegram_${me.id || Date.now()}`;
  if (bots.some((b) => b.id === id)) {
    throw new Error('Ese bot ya está registrado');
  }
  const username = me.username ? `@${me.username}` : (me.first_name || '');
  const entry = { id, label: lbl, token: tok, username, enabled: true };
  bots.push(entry);
  saveBots();
  getMeCache.set(id, { ok: true, username, ts: Date.now() });
  console.log(`[telegram] Bot añadido ${id} ${username}`);
  return { id, label: lbl, username };
}

export function removeTelegramBot(sessionId) {
  const before = bots.length;
  bots = bots.filter((b) => b.id !== sessionId);
  if (bots.length === before) throw new Error('Sesión Telegram no existe');
  saveBots();
  getMeCache.delete(sessionId);
  sentToday.delete(sessionId);
  console.log(`[telegram] Bot eliminado ${sessionId}`);
}

/**
 * Envía un mensaje con un bot Telegram.
 * @param {string} chatId - chat_id de usuario o grupo (puede ser negativo)
 * @param {string} body
 * @param {string} [sessionId] - telegram_xxx ; si hay un solo bot, se usa ese
 */
export async function sendTelegramMessage(chatId, body, sessionId = null) {
  const to = String(chatId).trim();
  if (!to) throw new Error('Falta chat_id (to)');
  let bot = findBot(sessionId);
  if (!bot && !sessionId) {
    const enabled = bots.filter((b) => b.enabled !== false);
    if (enabled.length === 1) bot = enabled[0];
    else if (enabled.length === 0) throw new Error('No hay bots Telegram configurados');
    else throw new Error('Hay varios bots. Usa &session=telegram_XXXX');
  }
  if (!bot) throw new Error(`Sesión Telegram ${sessionId} no existe`);

  const text = String(body).slice(0, 4096);
  try {
    await telegramCall(bot.token, 'sendMessage', { chat_id: to, text });
    bumpStat(bot.id, 'sent');
    rememberChat(bot, to).catch(() => {});
    return { success: true, sessionId: bot.id };
  } catch (err) {
    bumpStat(bot.id, 'failed');
    throw new Error(`Telegram: ${err.message}`);
  }
}

export function listTelegramChats(sessionId) {
  return requireBot(sessionId).chats.map(chatSummary);
}

export async function addTelegramChat(sessionId, chatId) {
  const bot = requireBot(sessionId);
  const id = String(chatId || '').trim();
  if (!id) throw new Error('Falta chat_id');
  if (bot.chats.some((c) => String(c.chatId) === id)) {
    throw new Error('Ese destino ya está en la lista');
  }
  const chat = await telegramCall(bot.token, 'getChat', { chat_id: id });
  const entry = {
    chatId: id,
    label: chat.title || chat.username || chat.first_name || id,
    type: chat.type || 'unknown',
  };
  bot.chats.push(entry);
  saveBots();
  return chatSummary(entry);
}

export function removeTelegramChat(sessionId, chatId) {
  const bot = requireBot(sessionId);
  const id = String(chatId || '').trim();
  const before = bot.chats.length;
  bot.chats = bot.chats.filter((c) => String(c.chatId) !== id);
  if (bot.chats.length === before) throw new Error('Destino no está en la lista');
  saveBots();
}

export async function getTelegramChatInfo(sessionId, chatId) {
  const bot = requireBot(sessionId);
  const id = String(chatId || '').trim();
  const chat = await telegramCall(bot.token, 'getChat', { chat_id: id });
  let members = null;
  try {
    members = await telegramCall(bot.token, 'getChatMemberCount', { chat_id: id });
  } catch {
    members = null;
  }
  const botUserId = Number(String(bot.id).replace(/^telegram_/, ''));
  let botStatus = null;
  try {
    const me = await telegramCall(bot.token, 'getChatMember', { chat_id: id, user_id: botUserId });
    botStatus = me.status || null;
  } catch {
    botStatus = null;
  }
  const saved = bot.chats.find((c) => String(c.chatId) === id);
  if (saved) {
    saved.label = chat.title || chat.username || chat.first_name || saved.label;
    saved.type = chat.type || saved.type;
    saveBots();
  }
  const isGroup = chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel';
  return {
    chatId: id,
    title: chat.title || chat.first_name || id,
    description: chat.description || '',
    type: chat.type,
    username: chat.username ? `@${chat.username}` : null,
    members,
    botStatus,
    canAdmin: isGroup && (botStatus === 'administrator' || botStatus === 'creator'),
    isGroup,
  };
}

export async function setTelegramChatTitle(sessionId, chatId, title) {
  const bot = requireBot(sessionId);
  const t = String(title || '').trim();
  if (!t) throw new Error('Falta el nombre');
  await telegramCall(bot.token, 'setChatTitle', { chat_id: String(chatId).trim(), title: t.slice(0, 128) });
  const saved = bot.chats.find((c) => String(c.chatId) === String(chatId).trim());
  if (saved) {
    saved.label = t.slice(0, 128);
    saveBots();
  }
}

export async function setTelegramChatDescription(sessionId, chatId, description) {
  const bot = requireBot(sessionId);
  await telegramCall(bot.token, 'setChatDescription', {
    chat_id: String(chatId).trim(),
    description: String(description || '').slice(0, 255),
  });
}

export async function createTelegramInviteLink(sessionId, chatId) {
  const bot = requireBot(sessionId);
  const link = await telegramCall(bot.token, 'createChatInviteLink', { chat_id: String(chatId).trim() });
  return { inviteLink: link.invite_link || link };
}

export async function kickTelegramMember(sessionId, chatId, userId) {
  const bot = requireBot(sessionId);
  const uid = String(userId || '').trim();
  if (!/^-?\d+$/.test(uid)) throw new Error('user_id inválido (solo números)');
  await telegramCall(bot.token, 'banChatMember', {
    chat_id: String(chatId).trim(),
    user_id: Number(uid),
  });
}

loadTelegramConfig();
