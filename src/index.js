/**
 * WSAPI - Router de notificaciones WhatsApp con Baileys
 * Sin UltraMsg: usa múltiples números de WhatsApp conectados directamente
 */

import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  startAll,
  sendMessage,
  getQrAsImage,
  getSessionsStatus,
  addSession,
  loadConfig,
} from './baileys-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fastify = Fastify({ logger: true });
const PORT = process.env.PORT || 3000;

// Iniciar sesiones Baileys
await startAll();

/**
 * Endpoint compatible con Traccar
 * GET/POST: to, body
 */
async function handleNotify(request, reply) {
  const to = request.query?.to || request.body?.to;
  const body = request.query?.body || request.body?.body;

  if (!to || !body) {
    return reply.status(400).send({
      error: [{ to: to ? 'ok' : 'is required' }, { body: body ? 'ok' : 'is required' }],
    });
  }

  try {
    const result = await sendMessage(to, body);
    return reply.send({ success: true, sessionId: result.sessionId });
  } catch (err) {
    request.log.error(err);
    return reply.status(502).send({ error: err.message });
  }
}

// Favicon - evita 404 en la consola del navegador
fastify.get('/favicon.ico', async (request, reply) => {
  return reply.status(204).send();
});

// Redirigir raíz al panel
fastify.get('/', async (request, reply) => {
  return reply.redirect(302, '/pair');
});

// Verificar versión (para confirmar que corre el código correcto)
fastify.get('/version', async () => ({ version: '2.0.0-baileys', hasPair: true }));

// API
fastify.all('/messages/chat', handleNotify);
fastify.all('/notify', handleNotify);
fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  sessions: getSessionsStatus(),
}));

// Panel para vincular números (QR) - también /pair/ por si acaso
const pairHandler = async (request, reply) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vincular números WhatsApp</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem; }
    h1 { color: #25D366; }
    .session { border: 1px solid #ddd; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    .session.connected { border-color: #25D366; background: #f0fff4; }
    .session.pending { border-color: #f59e0b; background: #fffbeb; }
    button { background: #25D366; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
    button:hover { background: #20bd5a; }
    #qr { margin: 1rem 0; }
    .status { font-weight: bold; }
    .connected { color: #16a34a; }
    .pending { color: #d97706; }
  </style>
</head>
<body>
  <h1>WSAPI - Vincular números WhatsApp</h1>
  <p>Selecciona un número para mostrar el código QR. Escanéalo con WhatsApp en el celular.</p>
  <div id="sessions"></div>
  <div id="qr" style="display:none;">
    <h3>Escanear con WhatsApp</h3>
    <p id="qrStatus">Generando código QR...</p>
    <img id="qrImg" alt="QR" style="display:none;" />
    <p><small>Escanea desde: WhatsApp → Configuración → Dispositivos vinculados → Vincular dispositivo</small></p>
    <button onclick="document.getElementById('qr').style.display='none'">Cerrar</button>
  </div>
  <script>
    function renderSessions(list) {
      var div = document.getElementById('sessions');
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var cls = s.connected ? 'connected' : 'pending';
        var status = s.connected ? 'Conectado' : 'Pendiente';
        var btn = s.connected ? '' : '<button data-id="' + s.id + '">Mostrar QR</button>';
        html += '<div class="session ' + cls + '"><span class="status ' + cls + '">' + status + '</span> ' + s.label + ' (' + s.id + ') ' + btn + '</div>';
      }
      div.innerHTML = html || '<p>Cargando...</p>';
      div.querySelectorAll('button[data-id]').forEach(function(btn) {
        btn.onclick = function() { showQr(btn.getAttribute('data-id')); };
      });
    }
    function loadSessions() {
      fetch('/api/sessions').then(function(r) { return r.json(); }).then(function(data) {
        renderSessions(data.sessions || []);
      }).catch(function() {
        document.getElementById('sessions').innerHTML = '<p>Error al cargar. Verifica que el servidor esté corriendo.</p>';
      });
    }
    function showQr(id) {
      var qrDiv = document.getElementById('qr');
      var qrImg = document.getElementById('qrImg');
      var qrStatus = document.getElementById('qrStatus');
      qrDiv.style.display = 'block';
      qrImg.style.display = 'none';
      qrStatus.textContent = 'Generando código QR...';
      qrStatus.style.display = 'block';
      var attempts = 0;
      var t = setInterval(function() {
        attempts++;
        fetch('/api/qr/' + id).then(function(r) { return r.json(); }).then(function(data) {
          if (data.qr) {
            clearInterval(t);
            qrImg.src = data.qr;
            qrImg.style.display = 'block';
            qrStatus.textContent = 'Escanea con WhatsApp';
            var check = setInterval(function() {
              fetch('/api/sessions').then(function(r) { return r.json(); }).then(function(d) {
                var sess = (d.sessions || []).find(function(x) { return x.id === id; });
                if (sess && sess.connected) { clearInterval(check); qrDiv.style.display = 'none'; loadSessions(); }
              });
            }, 2000);
          } else {
            fetch('/api/sessions').then(function(r) { return r.json(); }).then(function(d) {
              var sess = (d.sessions || []).find(function(x) { return x.id === id; });
              if (sess && sess.connected) {
                clearInterval(t);
                qrDiv.style.display = 'none';
                loadSessions();
              } else if (attempts >= 30) {
                clearInterval(t);
                qrStatus.innerHTML = 'No se generó el QR. Reinicia el servidor.';
              }
            });
          }
        });
      }, 2000);
    }
    loadSessions();
    setInterval(loadSessions, 5000);
  </script>
</body>
</html>`;
  return reply.type('text/html').send(html);
};
fastify.get('/pair', pairHandler);
fastify.get('/pair/', pairHandler);

// API para el panel
fastify.get('/api/sessions', async () => ({ sessions: getSessionsStatus() }));
fastify.get('/api/qr/:id', async (request, reply) => {
  const qr = await getQrAsImage(request.params.id);
  return reply.send({ qr: qr || null });
});

// Añadir nueva sesión
fastify.post('/api/sessions', async (request, reply) => {
  try {
    const { id, label } = request.body || {};
    const newSession = addSession(id || `numero_${Date.now()}`, label || id);
    return reply.send({ success: true, session: newSession });
  } catch (err) {
    return reply.status(400).send({ error: err.message });
  }
});

// Iniciar
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`
🚀 WSAPI Baileys - Notificaciones WhatsApp (sin UltraMsg)

URL para Traccar:
  http://TU_IP:${PORT}/messages/chat?to=%NUMBER%&body=%MESSAGE%

Panel para vincular números: http://TU_IP:${PORT}/pair
`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
