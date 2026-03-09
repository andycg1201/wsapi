/**
 * Gestor de múltiples sesiones Baileys con round-robin
 */

import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

const AUTH_BASE = path.join(process.cwd(), 'auth_sessions');
let sessions = new Map(); // id -> { sock, connected, qr, label }
let config = [];
let roundRobinIndex = 0;

/**
 * Formatea número al JID de WhatsApp
 */
function toJid(phone) {
  const cleaned = String(phone).replace(/\D/g, '');
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

  const sock = makeWASocket({
    auth: state,
  });

  sessions.set(id, { sock, connected: false, qr: null, label: label || id });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const entry = sessions.get(id);

    if (qr) {
      entry.qr = qr;
      entry.connected = false;
      console.log(`[${id}] QR generado - visible en /pair`);
    }

    if (connection === 'open') {
      entry.connected = true;
      entry.qr = null;
      console.log(`✓ [${id}] Conectado`);
    }

    if (connection === 'close') {
      entry.connected = false;
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
}

/**
 * Inicia todas las sesiones configuradas (con pausa entre cada una para evitar Connection Failure)
 */
export async function startAll() {
  loadConfig();
  for (let i = 0; i < config.length; i++) {
    try {
      await connectSession(config[i]);
      // Pausa de 8 segundos entre sesiones para no saturar la conexión a WhatsApp
      if (i < config.length - 1) {
        await new Promise((r) => setTimeout(r, 8000));
      }
    } catch (err) {
      console.error(`Error iniciando ${config[i].id}:`, err.message);
    }
  }
}

/**
 * Obtiene lista de sockets conectados
 */
function getConnectedSockets() {
  return [...sessions.entries()]
    .filter(([, v]) => v.connected && v.sock)
    .map(([id, v]) => ({ id, sock: v.sock, label: v.label }));
}

/**
 * Envía mensaje usando round-robin entre sesiones conectadas
 */
export async function sendMessage(to, body) {
  const connected = getConnectedSockets();
  if (connected.length === 0) {
    throw new Error('No hay sesiones conectadas. Vincula los números en /pair');
  }

  const jid = toJid(to);
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
      connected: entry?.connected ?? false,
      needsQr: !!entry?.qr,
    };
  });
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
