/**
 * Gestor de múltiples sesiones Baileys con round-robin
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

const AUTH_BASE = path.join(process.cwd(), 'auth_sessions');
const PRESENCE_INTERVAL_MS = 10 * 60 * 1000; // latido cada 10 min (evita sesión "dormida")
const HEALTH_CHECK_MS = 2 * 60 * 1000; // revisa sesiones atascadas cada 2 min
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

  if (sessionId) {
    const entry = sessions.get(sessionId);
    if (!entry || !entry.connected || !entry.sock) {
      throw new Error(`Sesión ${sessionId} no disponible. Verifica que esté conectada en /pair`);
    }
    try {
      await entry.sock.sendMessage(jid, { text: body });
      return { success: true, sessionId };
    } catch (err) {
      throw new Error(`Error enviando con ${sessionId}: ${err.message}`);
    }
  }

  const connected = getConnectedSockets(true);
  if (connected.length === 0) {
    throw new Error('No hay sesiones dinámicas conectadas. Vincula números en /pair o usa ?session=numero_X para uno fijo');
  }

  const attempts = connected.length;
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    const idx = (roundRobinIndex + i) % connected.length;
    const { id, sock } = connected[idx];
    roundRobinIndex = (roundRobinIndex + 1) % connected.length;

    try {
      await sock.sendMessage(jid, { text: body });
      return { success: true, sessionId: id };
    } catch (err) {
      lastError = err;
      console.warn(`[${id}] Error enviando, intentando siguiente:`, err.message);
    }
  }

  throw new Error(`No se pudo enviar. Último error: ${lastError?.message || lastError}`);
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
