/**
 * Gestor de múltiples sesiones Baileys con round-robin
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { execFile } from 'child_process';

const AUTH_BASE = path.join(process.cwd(), 'auth_sessions');
const PRESENCE_INTERVAL_MS = 10 * 60 * 1000; // latido cada 10 min (evita sesión "dormida")
const HEALTH_CHECK_MS = 2 * 60 * 1000; // revisa sesiones atascadas cada 2 min
const SENT_MSG_TTL_MS = 60 * 60 * 1000; // mensajes enviados en cache 1 h (para reintentos)
const MAX_MSG_RETRIES = 3; // tras 3 reintentos fallidos el mensaje se descarta

// Cache de mensajes enviados: permite responder los "retry receipts" de WhatsApp
// cuando el cliente no pudo descifrar (evita el "Esperando el mensaje" permanente)
const sentMessages = new Map(); // msgId -> { message, ts }

setInterval(() => {
  const cutoff = Date.now() - SENT_MSG_TTL_MS;
  for (const [key, val] of sentMessages) {
    if (val.ts < cutoff) sentMessages.delete(key);
  }
}, 10 * 60 * 1000).unref();

/** Cache mínimo con interfaz CacheStore que Baileys usa para contar reintentos */
function createRetryCounterCache() {
  const store = new Map(); // key -> { value, ts }
  const TTL = 60 * 60 * 1000;
  return {
    get(key) {
      const item = store.get(key);
      if (!item) return undefined;
      if (Date.now() - item.ts > TTL) {
        store.delete(key);
        return undefined;
      }
      return item.value;
    },
    set(key, value) {
      store.set(key, { value, ts: Date.now() });
      if (store.size > 5000) {
        const cutoff = Date.now() - TTL;
        for (const [k, v] of store) {
          if (v.ts < cutoff) store.delete(k);
        }
      }
    },
    del(key) {
      store.delete(key);
    },
    flushAll() {
      store.clear();
    },
  };
}

const msgRetryCounterCache = createRetryCounterCache();

// ---------------------------------------------------------------------------
// Registro de números con problemas (sin WhatsApp o con errores de envío)
// Persistido en config/failed_numbers.json para revisarlo en el panel /pair
// ---------------------------------------------------------------------------
const FAILED_NUMBERS_PATH = path.join(process.cwd(), 'config', 'failed_numbers.json');
const ONWHATSAPP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // re-verificar número cada 24 h

let failedNumbers = new Map(); // phone -> { phone, reason, sampleBody, count, firstAt, lastAt }
const onWhatsAppCache = new Map(); // phone -> { exists, ts }
let saveFailedTimer = null;

function loadFailedNumbers() {
  try {
    if (fs.existsSync(FAILED_NUMBERS_PATH)) {
      const list = JSON.parse(fs.readFileSync(FAILED_NUMBERS_PATH, 'utf-8'));
      failedNumbers = new Map(list.map((f) => [f.phone, f]));
      if (failedNumbers.size) {
        console.log(`✓ ${failedNumbers.size} número(s) con problemas cargado(s)`);
      }
    }
  } catch (err) {
    console.error('Error cargando failed_numbers.json:', err.message);
  }
}

function saveFailedNumbers() {
  if (saveFailedTimer) return;
  saveFailedTimer = setTimeout(() => {
    saveFailedTimer = null;
    try {
      fs.writeFileSync(
        FAILED_NUMBERS_PATH,
        JSON.stringify([...failedNumbers.values()], null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('Error guardando failed_numbers.json:', err.message);
    }
  }, 2000);
}

function recordFailedNumber(phone, reason, sampleBody) {
  const now = new Date().toISOString();
  const existing = failedNumbers.get(phone);
  if (existing) {
    existing.count += 1;
    existing.lastAt = now;
    existing.reason = reason;
    if (sampleBody) existing.sampleBody = String(sampleBody).slice(0, 300);
  } else {
    failedNumbers.set(phone, {
      phone,
      reason,
      sampleBody: sampleBody ? String(sampleBody).slice(0, 300) : null,
      count: 1,
      firstAt: now,
      lastAt: now,
    });
  }
  saveFailedNumbers();
}

function clearFailedEntry(phone) {
  if (failedNumbers.delete(phone)) saveFailedNumbers();
}

export function getFailedNumbers() {
  return [...failedNumbers.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

export function clearFailedNumber(phone) {
  onWhatsAppCache.delete(phone);
  clearFailedEntry(phone);
}

// ---------------------------------------------------------------------------
// Ajustes opcionales (config/settings.json — se crea a mano en cada VPS):
// { "adminPhone": "5939XXXXXXXX", "maxEventAgeMin": 15 }
// ---------------------------------------------------------------------------
const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');
let settings = { adminPhone: null, maxEventAgeMin: 15 };

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')) };
      console.log(
        `✓ Ajustes: umbral antigüedad ${settings.maxEventAgeMin} min` +
        (settings.adminPhone ? ` · alertas a ${settings.adminPhone}` : ' · sin número admin')
      );
    }
  } catch (err) {
    console.error('Error cargando settings.json:', err.message);
  }
}

export function getSettings() {
  return settings;
}

// ---------------------------------------------------------------------------
// Estadísticas del día (en memoria, se reinician a medianoche o al reiniciar)
// ---------------------------------------------------------------------------
let stats = { date: todayStr(), perSession: {}, discardedOld: 0, failedSends: 0 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function rolloverStatsIfNeeded() {
  if (stats.date !== todayStr()) {
    stats = { date: todayStr(), perSession: {}, discardedOld: 0, failedSends: 0 };
  }
}

function bumpSessionStat(sessionId, field) {
  rolloverStatsIfNeeded();
  if (!stats.perSession[sessionId]) stats.perSession[sessionId] = { sent: 0, failed: 0 };
  stats.perSession[sessionId][field] += 1;
}

export function recordDiscardedOld() {
  rolloverStatsIfNeeded();
  stats.discardedOld += 1;
}

export function getStats() {
  rolloverStatsIfNeeded();
  return stats;
}

// ---------------------------------------------------------------------------
// Alertas al administrador por WhatsApp (si settings.adminPhone está definido)
// ---------------------------------------------------------------------------
const ALERT_AFTER_MS = 10 * 60 * 1000; // avisar si una sesión lleva >10 min caída
const offlineSince = new Map(); // sessionId -> timestamp primera vez vista offline
const alertedSessions = new Set(); // sesiones ya avisadas en esta caída

async function sendAdminAlert(text) {
  if (!settings.adminPhone) return;
  try {
    await sendMessage(settings.adminPhone, `⚠️ WSAPI\n\n${text}`);
  } catch (err) {
    console.warn('No se pudo enviar alerta al admin:', err.message);
  }
}

function checkOfflineAlerts() {
  if (!settings.adminPhone) return;
  for (const c of config) {
    if (!hasExistingAuth(c.id)) continue;
    const entry = sessions.get(c.id);
    const isOffline = !entry?.connected && !entry?.connecting;

    if (!isOffline) {
      if (alertedSessions.has(c.id)) {
        alertedSessions.delete(c.id);
        sendAdminAlert(`La sesión ${c.label || c.id} (${c.phone || 's/n'}) se recuperó y está en línea.`);
      }
      offlineSince.delete(c.id);
      continue;
    }

    if (!offlineSince.has(c.id)) offlineSince.set(c.id, Date.now());
    const downMs = Date.now() - offlineSince.get(c.id);
    if (downMs > ALERT_AFTER_MS && !alertedSessions.has(c.id)) {
      alertedSessions.add(c.id);
      sendAdminAlert(
        `La sesión ${c.label || c.id} (${c.phone || 's/n'}) lleva ${Math.round(downMs / 60000)} min desconectada y no se ha podido reconectar. Revisa el panel /pair.`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Chequeo diario de versión de Baileys (badge en /pair + alerta al admin)
// ---------------------------------------------------------------------------
const VERSION_CHECK_MS = 24 * 60 * 60 * 1000;
const VERSION_NOTIFIED_PATH = path.join(process.cwd(), 'config', 'baileys-version-notified.txt');
let versionInfo = { installed: null, latest: null, updateAvailable: false };

function getInstalledBaileysVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'node_modules', 'baileys', 'package.json'), 'utf-8')
    );
    return pkg.version;
  } catch (_) {
    return null;
  }
}

async function checkBaileysVersion() {
  try {
    const installed = getInstalledBaileysVersion();
    const res = await fetch('https://registry.npmjs.org/-/package/baileys/dist-tags', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return;
    const tags = await res.json();
    const latest = tags.latest || null;
    versionInfo = {
      installed,
      latest,
      updateAvailable: !!(installed && latest && installed !== latest),
    };
    if (!versionInfo.updateAvailable) return;

    console.log(`Baileys ${latest} disponible (instalada ${installed})`);
    let lastNotified = null;
    try {
      lastNotified = fs.readFileSync(VERSION_NOTIFIED_PATH, 'utf-8').trim();
    } catch (_) {}
    if (settings.adminPhone && lastNotified !== latest) {
      await sendAdminAlert(
        `Hay una nueva versión de Baileys disponible: ${latest} (instalada: ${installed}).\n\nCuando quieras actualizamos como la última vez.`
      );
      fs.writeFileSync(VERSION_NOTIFIED_PATH, latest, 'utf-8');
    }
  } catch (err) {
    console.warn('No se pudo verificar versión de Baileys:', err.message);
  }
}

export function getVersionInfo() {
  return versionInfo;
}

function startVersionCheck() {
  versionInfo.installed = getInstalledBaileysVersion();
  setTimeout(checkBaileysVersion, 3 * 60 * 1000).unref(); // 3 min tras arrancar (sesiones ya en línea)
  setInterval(checkBaileysVersion, VERSION_CHECK_MS).unref();
}

// ---------------------------------------------------------------------------
// Backup diario de auth_sessions (tar.gz en backups/, conserva los últimos 7)
// ---------------------------------------------------------------------------
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function runAuthBackup() {
  try {
    if (!fs.existsSync(AUTH_BASE)) return;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `auth_${todayStr()}.tar.gz`);
    execFile(
      'tar',
      ['-czf', file, '-C', process.cwd(), 'auth_sessions', 'config'],
      (err) => {
        if (err) {
          console.warn('Backup auth_sessions falló:', err.message);
          return;
        }
        console.log(`✓ Backup creado: ${path.basename(file)}`);
        const old = fs.readdirSync(BACKUP_DIR)
          .filter((f) => f.startsWith('auth_') && f.endsWith('.tar.gz'))
          .sort()
          .slice(0, -7);
        for (const f of old) fs.unlinkSync(path.join(BACKUP_DIR, f));
      }
    );
  } catch (err) {
    console.warn('Backup auth_sessions falló:', err.message);
  }
}

function startDailyBackup() {
  setTimeout(runAuthBackup, 60 * 1000).unref(); // primer backup 1 min tras arrancar
  setInterval(runAuthBackup, BACKUP_INTERVAL_MS).unref();
}

/**
 * Verifica si un número está registrado en WhatsApp (con cache de 24 h).
 * Ante cualquier error de la consulta se asume que sí existe (no bloquear envíos).
 */
async function isOnWhatsApp(sock, phone) {
  const cached = onWhatsAppCache.get(phone);
  if (cached && Date.now() - cached.ts < ONWHATSAPP_CACHE_TTL_MS) return cached.exists;
  try {
    const results = await sock.onWhatsApp(phone);
    const exists = !!results?.[0]?.exists;
    onWhatsAppCache.set(phone, { exists, ts: Date.now() });
    return exists;
  } catch (_) {
    return true;
  }
}
let sessions = new Map(); // id -> { sock, connected, qr, label, connecting, keepAliveTimer?, reconnectTimer? }
let config = [];
let roundRobinIndex = 0;
let healthCheckStarted = false;

function clearReconnectTimer(entry) {
  if (entry?.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
}

function stopKeepAlive(entry) {
  if (entry?.keepAliveTimer) {
    clearInterval(entry.keepAliveTimer);
    entry.keepAliveTimer = null;
  }
}

function teardownSession(entry, { endSocket = false } = {}) {
  if (!entry) return;
  stopKeepAlive(entry);
  clearReconnectTimer(entry);
  if (endSocket && entry.sock) {
    try {
      entry.sock.end?.();
    } catch (_) {}
  }
}

function getDisconnectStatus(lastDisconnect) {
  if (lastDisconnect?.error instanceof Boom) {
    return lastDisconnect.error.output?.statusCode ?? null;
  }
  return null;
}

function getReconnectDelay(statusCode) {
  if (statusCode === DisconnectReason.restartRequired) return 2000;
  if (
    statusCode === DisconnectReason.timedOut
    || statusCode === DisconnectReason.connectionClosed
    || statusCode === DisconnectReason.connectionLost
  ) {
    return 5000;
  }
  return 15000;
}

function scheduleReconnect(sessionConfig, entry, delayMs) {
  if (!entry) return;
  clearReconnectTimer(entry);
  const { id } = sessionConfig;
  console.log(`[${id}] Reconectando en ${Math.round(delayMs / 1000)} s...`);
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null;
    connectSession(sessionConfig);
  }, delayMs);
}

function startHealthCheck() {
  if (healthCheckStarted) return;
  healthCheckStarted = true;
  setInterval(() => {
    checkOfflineAlerts();
    for (const sessionConfig of config) {
      if (!hasExistingAuth(sessionConfig.id)) continue;
      const entry = sessions.get(sessionConfig.id);
      if (entry?.connected || entry?.connecting || entry?.reconnectTimer) continue;
      console.log(`[${sessionConfig.id}] Health check: sesión inactiva, reconectando...`);
      try {
        reconnectSession(sessionConfig.id);
      } catch (err) {
        console.error(`[${sessionConfig.id}] Health check:`, err.message);
      }
    }
  }, HEALTH_CHECK_MS);
  console.log(`✓ Health check cada ${HEALTH_CHECK_MS / 60000} min (sesiones atascadas)`);
}

async function pingSession(id, sock) {
  try {
    await sock.sendPresenceUpdate('available');
  } catch (err) {
    console.warn(`[${id}] Keep-alive:`, err.message);
  }
}

function startKeepAlive(id, sock, entry) {
  stopKeepAlive(entry);
  pingSession(id, sock);
  entry.keepAliveTimer = setInterval(() => pingSession(id, sock), PRESENCE_INTERVAL_MS);
}

/** Verifica si la sesión ya tiene credenciales guardadas */
function hasExistingAuth(sessionId) {
  const credsPath = path.join(AUTH_BASE, sessionId, 'creds.json');
  return fs.existsSync(credsPath);
}

/** Extrae número de teléfono del JID (ej: 573205257502:7@s.whatsapp.net -> 573205257502) */
function jidToPhone(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const part = jid.split('@')[0] || jid;
  return part.split(':')[0] || part;
}

/** Actualiza sesión en config con phone y label cuando se vincula */
function updateSessionInConfig(sessionId, { phone, label }) {
  const configPath = path.join(process.cwd(), 'config', 'sessions.json');
  let fullConfig = [];
  if (fs.existsSync(configPath)) {
    fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  const idx = fullConfig.findIndex((s) => s.id === sessionId);
  if (idx < 0) return;
  if (phone) fullConfig[idx].phone = phone;
  if (label) fullConfig[idx].label = label;
  fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  config = fullConfig.filter((s) => s.enabled !== false);
  const entry = sessions.get(sessionId);
  if (entry && label) entry.label = label;
}

/**
 * Formatea número o JID al formato de WhatsApp
 * - Si ya tiene @g.us o @s.whatsapp.net, lo devuelve tal cual
 * - Si no, asume número de teléfono (con código de país)
 */
function toJid(phone) {
  const s = String(phone).trim();
  if (s.endsWith('@g.us') || s.endsWith('@s.whatsapp.net')) return s;
  let cleaned = s.replace(/\D/g, '');
  if (cleaned.length === 10 && /^[1-9]/.test(cleaned)) {
    cleaned = '52' + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Carga configuración de sesiones
 */
export function loadConfig() {
  try {
    const configPath = path.join(process.cwd(), 'config', 'sessions.json');
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      config = config.filter((s) => s.enabled !== false);
      console.log(`✓ ${config.length} sesión(es) configurada(s)`);
    }
    return config;
  } catch (err) {
    console.error('Error cargando config:', err.message);
    return [];
  }
}

/**
 * Crea y conecta una sesión
 */
async function connectSession(sessionConfig) {
  const { id, label } = sessionConfig;
  const authPath = path.join(AUTH_BASE, id);

  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
  }

  const existing = sessions.get(id);
  if (existing) teardownSession(existing, { endSocket: true });

  sessions.set(id, {
    sock: null,
    connected: false,
    qr: null,
    label: label || id,
    connecting: true,
    reconnectTimer: null,
  });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  const entry = sessions.get(id);
  if (!entry) return;

  // WhatsApp rechaza WEB/Ubuntu; requiere MACOS para vincular (Issue #2364)
  const sock = makeWASocket({
    auth: state,
    browser: ['Mac OS', 'Chrome', '14.4.1'],
    printQRInTerminal: false,
    markOnlineOnConnect: true,
    keepAliveIntervalMs: 30000,
    // Reintentos cuando el cliente no puede descifrar ("Esperando el mensaje"):
    // getMessage devuelve el contenido original para reenviarlo; tras
    // MAX_MSG_RETRIES intentos Baileys lo descarta (no congestiona WhatsApp)
    msgRetryCounterCache,
    maxMsgRetryCount: MAX_MSG_RETRIES,
    getMessage: async (key) => {
      const cached = sentMessages.get(key?.id);
      if (cached) {
        console.log(`[${id}] Retry solicitado para mensaje ${key.id} - reenviando`);
        return cached.message;
      }
      console.log(`[${id}] Retry solicitado para mensaje ${key?.id} - no está en cache, se descarta`);
      return undefined;
    },
  });

  entry.sock = sock;
  entry.connecting = true;

  sock.ev.on('connection.update', async (update) => {
    const entry = sessions.get(id);
    if (!entry || entry.sock !== sock) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qr = qr;
      entry.connected = false;
      entry.connecting = false;
      console.log(`[${id}] QR generado - visible en /pair`);
    }

    if (connection === 'open') {
      entry.connected = true;
      entry.qr = null;
      entry.connecting = false;
      clearReconnectTimer(entry);
      startKeepAlive(id, sock, entry);
      console.log(`✓ [${id}] Conectado`);
      setImmediate(() => {
        const me = state.creds?.me;
        if (me?.id) {
          const phone = jidToPhone(me.id);
          const name = me.name || null;
          if (phone || name) {
            updateSessionInConfig(id, { phone: phone || undefined, label: name || undefined });
            if (name) console.log(`  → ${id}: ${name} (${phone || ''})`);
          }
        }
      });
    }

    if (connection === 'close') {
      entry.connected = false;
      entry.connecting = false;
      stopKeepAlive(entry);
      const statusCode = getDisconnectStatus(lastDisconnect);
      const errMsg = lastDisconnect?.error?.message;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[${id}] Sesión cerrada por el usuario (401)`);
        sessions.delete(id);
        return;
      }

      if (statusCode === DisconnectReason.connectionReplaced) {
        console.log(`[${id}] Sesión reemplazada por otra conexión (440)`);
        sessions.delete(id);
        return;
      }

      console.log(
        `[${id}] Conexión cerrada (código ${statusCode ?? '?'})${errMsg ? `: ${errMsg}` : ''}`
      );

      if (!hasExistingAuth(id)) {
        console.log(`[${id}] Sin vincular — espera "Mostrar QR" para reintentar`);
        teardownSession(entry, { endSocket: true });
        sessions.delete(id);
        return;
      }

      scheduleReconnect(sessionConfig, entry, getReconnectDelay(statusCode));
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('creds.update', () => {
    const entry = sessions.get(id);
    if (entry?.connected && state.creds?.me?.id) {
      const me = state.creds.me;
      const phone = jidToPhone(me.id);
      const name = me.name || null;
      if (phone || name) {
        updateSessionInConfig(id, { phone: phone || undefined, label: name || undefined });
      }
    }
  });
}

/**
 * Inicia solo las sesiones que ya tienen credenciales (evita Connection Failure por saturación).
 * Las sesiones sin vincular se conectan on-demand cuando el usuario pide el QR.
 */
export async function startAll() {
  loadConfig();
  loadSettings();
  loadFailedNumbers();
  startDailyBackup();
  startVersionCheck();
  const withAuth = config.filter((c) => hasExistingAuth(c.id));
  const withoutAuth = config.filter((c) => !hasExistingAuth(c.id));
  if (withAuth.length) {
    console.log(`Iniciando ${withAuth.length} sesión(es) con auth existente...`);
  }
  if (withoutAuth.length) {
    console.log(`${withoutAuth.length} sesión(es) pendiente(s) - conectarán al pedir QR`);
  }
  for (let i = 0; i < withAuth.length; i++) {
    try {
      await connectSession(withAuth[i]);
      if (i < withAuth.length - 1) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (err) {
      console.error(`Error iniciando ${withAuth[i].id}:`, err.message);
    }
  }
  startHealthCheck();
}

/**
 * Conecta una sesión bajo demanda (cuando el usuario pide el QR).
 * Evita saturar con múltiples conexiones simultáneas.
 */
export function ensureSessionConnected(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry?.connected || entry?.connecting || entry?.qr) return;
  const sessionConfig = config.find((c) => c.id === sessionId);
  if (!sessionConfig) return;
  if (entry?.sock) {
    if (hasExistingAuth(sessionId)) {
      reconnectSession(sessionId);
    } else {
      teardownSession(entry, { endSocket: true });
      sessions.delete(sessionId);
      console.log(`[${sessionId}] Reiniciando conexión para QR...`);
      connectSession(sessionConfig);
    }
    return;
  }
  console.log(`[${sessionId}] Conectando bajo demanda (QR solicitado)...`);
  connectSession(sessionConfig);
}

/** Reconecta sesión vinculada que quedó desconectada (sin escanear QR) */
export function reconnectSession(sessionId) {
  const sessionConfig = config.find((c) => c.id === sessionId);
  if (!sessionConfig) throw new Error(`Sesión ${sessionId} no existe`);
  if (!hasExistingAuth(sessionId)) throw new Error('Sesión sin vincular. Usa Mostrar QR.');
  const entry = sessions.get(sessionId);
  if (entry) {
    teardownSession(entry, { endSocket: true });
    sessions.delete(sessionId);
  }
  console.log(`[${sessionId}] Reconexión manual...`);
  connectSession(sessionConfig);
}

/**
 * Obtiene lista de sockets conectados
 * @param {boolean} dynamicOnly - Si true, solo incluye sesiones con fixed !== true
 */
function getConnectedSockets(dynamicOnly = false) {
  let list = [...sessions.entries()]
    .filter(([, v]) => v.connected && v.sock)
    .map(([id, v]) => ({ id, sock: v.sock, label: v.label }));

  if (dynamicOnly) {
    list = list.filter(({ id }) => {
      const cfg = config.find((c) => c.id === id);
      return !cfg || cfg.fixed !== true;
    });
  }
  return list;
}

/**
 * Envía mensaje
 * @param {string} to - Número destino
 * @param {string} body - Contenido del mensaje
 * @param {string} [sessionId] - Opcional. Si se indica, usa solo esa sesión (fijo). Si no, round-robin entre dinámicos
 */
export async function sendMessage(to, body, sessionId = null) {
  const jid = toJid(to);
  // Solo se verifica/registra números individuales, no grupos
  const phone = jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : null;

  if (sessionId) {
    const entry = sessions.get(sessionId);
    if (!entry || !entry.connected || !entry.sock) {
      throw new Error(`Sesión ${sessionId} no disponible. Verifica que esté conectada en /pair`);
    }
    if (phone && !(await isOnWhatsApp(entry.sock, phone))) {
      recordFailedNumber(phone, 'no_whatsapp', body);
      throw new Error(`El número ${phone} no está registrado en WhatsApp`);
    }
    try {
      const result = await entry.sock.sendMessage(jid, { text: body });
      cacheSentMessage(result);
      bumpSessionStat(sessionId, 'sent');
      if (phone) clearFailedEntry(phone);
      return { success: true, sessionId };
    } catch (err) {
      bumpSessionStat(sessionId, 'failed');
      if (phone) recordFailedNumber(phone, 'send_error', body);
      throw new Error(`Error enviando con ${sessionId}: ${err.message}`);
    }
  }

  const connected = getConnectedSockets(true);
  if (connected.length === 0) {
    throw new Error('No hay sesiones dinámicas conectadas. Vincula números en /pair o usa ?session=numero_X para uno fijo');
  }

  if (phone && !(await isOnWhatsApp(connected[0].sock, phone))) {
    recordFailedNumber(phone, 'no_whatsapp', body);
    throw new Error(`El número ${phone} no está registrado en WhatsApp`);
  }

  const attempts = connected.length;
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    const idx = (roundRobinIndex + i) % connected.length;
    const { id, sock } = connected[idx];
    roundRobinIndex = (roundRobinIndex + 1) % connected.length;

    try {
      const result = await sock.sendMessage(jid, { text: body });
      cacheSentMessage(result);
      bumpSessionStat(id, 'sent');
      if (phone) clearFailedEntry(phone);
      return { success: true, sessionId: id };
    } catch (err) {
      lastError = err;
      bumpSessionStat(id, 'failed');
      console.warn(`[${id}] Error enviando, intentando siguiente:`, err.message);
    }
  }

  rolloverStatsIfNeeded();
  stats.failedSends += 1;
  if (phone) recordFailedNumber(phone, 'send_error', body);
  throw new Error(`No se pudo enviar. Último error: ${lastError?.message || lastError}`);
}

/** Guarda el mensaje enviado en cache (1 h) para poder responder retry receipts */
function cacheSentMessage(result) {
  const msgId = result?.key?.id;
  if (msgId && result?.message) {
    sentMessages.set(msgId, { message: result.message, ts: Date.now() });
  }
}

/**
 * Obtiene el QR de una sesión (para vincular)
 */
export function getSessionQr(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry || !entry.qr) return null;
  return entry.qr;
}

/**
 * Genera QR como imagen base64 para mostrar en web
 */
export async function getQrAsImage(sessionId) {
  const qr = await waitForSessionQr(sessionId);
  if (!qr) return null;
  return await QRCode.toDataURL(qr, { width: 300 });
}

const QR_WAIT_MS = 20000;

/** Espera a que Baileys emita el QR sin reiniciar la conexión en curso */
async function waitForSessionQr(sessionId, timeoutMs = QR_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const qr = getSessionQr(sessionId);
    if (qr) return qr;

    const entry = sessions.get(sessionId);
    const pending = config.some((c) => c.id === sessionId);
    if (entry?.connecting || entry?.sock || entry?.qr || (!entry && pending)) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    break;
  }
  return getSessionQr(sessionId);
}

/**
 * Estado de todas las sesiones
 */
export function getSessionsStatus() {
  return config.map((c) => {
    const entry = sessions.get(c.id);
    const linked = hasExistingAuth(c.id);
    let status = 'unlinked';
    if (entry?.connected) status = 'online';
    else if (entry?.connecting) status = 'connecting';
    else if (linked) status = 'offline';

    return {
      id: c.id,
      label: c.label,
      phone: c.phone || null,
      fixed: c.fixed === true,
      connected: entry?.connected ?? false,
      needsQr: !!entry?.qr,
      status,
    };
  });
}

/**
 * Obtiene los grupos de una sesión conectada
 * @returns {Promise<Array<{id:string,subject:string}>>}
 */
export async function getSessionGroups(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry || !entry.connected || !entry.sock) {
    throw new Error(`Sesión ${sessionId} no disponible o no está conectada`);
  }
  const data = await entry.sock.groupFetchAllParticipating();
  return Object.values(data).map((g) => ({
    id: g.id,
    subject: g.subject || '(Sin nombre)',
  }));
}

/**
 * Añade una nueva sesión a la config y la inicia
 */
export function addSession(id, label = id) {
  const configPath = path.join(process.cwd(), 'config', 'sessions.json');
  let fullConfig = [];
  if (fs.existsSync(configPath)) {
    fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  if (fullConfig.some((s) => s.id === id)) {
    throw new Error(`La sesión ${id} ya existe`);
  }
  const newSession = { id, label, enabled: true };
  fullConfig.push(newSession);
  fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  config = fullConfig.filter((s) => s.enabled !== false);
  console.log(`[${id}] Sesión añadida — usa "Mostrar QR" para vincular`);
  return newSession;
}

const DELETE_PIN = '1980';

/**
 * Elimina una sesión (desconecta, quita de config, borra auth)
 */
export function removeSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry) {
    teardownSession(entry, { endSocket: true });
    sessions.delete(sessionId);
  }
  const configPath = path.join(process.cwd(), 'config', 'sessions.json');
  let fullConfig = [];
  if (fs.existsSync(configPath)) {
    fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  fullConfig = fullConfig.filter((s) => s.id !== sessionId);
  fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  config = fullConfig.filter((s) => s.enabled !== false);
  const authPath = path.join(AUTH_BASE, sessionId);
  if (fs.existsSync(authPath)) {
    fs.rmSync(authPath, { recursive: true });
  }
  console.log(`[${sessionId}] Sesión eliminada`);
}

export function validateDeletePin(pin) {
  return String(pin).trim() === DELETE_PIN;
}

/**
 * Marca o desmarca una sesión como exclusiva (fija)
 */
export function setSessionFixed(sessionId, fixed) {
  const configPath = path.join(process.cwd(), 'config', 'sessions.json');
  let fullConfig = [];
  if (fs.existsSync(configPath)) {
    fullConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  const idx = fullConfig.findIndex((s) => s.id === sessionId);
  if (idx < 0) throw new Error(`Sesión ${sessionId} no existe`);
  fullConfig[idx].fixed = fixed === true;
  fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf-8');
  config = fullConfig.filter((s) => s.enabled !== false);
}
