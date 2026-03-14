/**
 * Gestor de múltiples sesiones Baileys con round-robin
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

const AUTH_BASE = path.join(process.cwd(), 'auth_sessions');
let sessions = new Map(); // id -> { sock, connected, qr, label, connecting }
let config = [];
let roundRobinIndex = 0;

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

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  // WhatsApp rechaza WEB/Ubuntu; requiere MACOS para vincular (Issue #2364)
  const sock = makeWASocket({
    auth: state,
    browser: ['Mac OS', 'Chrome', '14.4.1'],
    printQRInTerminal: false,
  });

  sessions.set(id, { sock, connected: false, qr: null, label: label || id, connecting: true });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const entry = sessions.get(id);

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
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : null;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[${id}] Sesión cerrada por el usuario`);
        sessions.delete(id);
        return;
      }

      console.log(`[${id}] Reconectando en 15 segundos...`);
      setTimeout(() => connectSession(sessionConfig), 15000);
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
}

/**
 * Conecta una sesión bajo demanda (cuando el usuario pide el QR).
 * Evita saturar con múltiples conexiones simultáneas.
 */
export function ensureSessionConnected(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry?.sock) return; // ya conectada o intentando
  const sessionConfig = config.find((c) => c.id === sessionId);
  if (!sessionConfig) return;
  console.log(`[${sessionId}] Conectando bajo demanda (QR solicitado)...`);
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
  const qr = getSessionQr(sessionId);
  if (!qr) return null;
  return await QRCode.toDataURL(qr, { width: 300 });
}

/**
 * Estado de todas las sesiones
 */
export function getSessionsStatus() {
  return config.map((c) => {
    const entry = sessions.get(c.id);
    return {
      id: c.id,
      label: c.label,
      phone: c.phone || null,
      fixed: c.fixed === true,
      connected: entry?.connected ?? false,
      needsQr: !!entry?.qr,
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
  connectSession(newSession);
  return newSession;
}

const DELETE_PIN = '1980';

/**
 * Elimina una sesión (desconecta, quita de config, borra auth)
 */
export function removeSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (entry?.sock) {
    try {
      entry.sock.end?.();
    } catch (_) {}
    sessions.delete(sessionId);
  } else {
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
