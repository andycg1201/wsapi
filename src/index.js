/**
 * WSAPI - Router de notificaciones WhatsApp con Baileys
 * Sin UltraMsg: usa múltiples números de WhatsApp conectados directamente
 */

import Fastify from 'fastify';
import formBody from '@fastify/formbody';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  startAll,
  sendMessage,
  getQrAsImage,
  getSessionsStatus,
  getSessionGroups,
  addSession,
  removeSession,
  validateDeletePin,
  setSessionFixed,
  loadConfig,
} from './baileys-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fastify = Fastify({ logger: true });
const PORT = process.env.PORT || 3000;

await fastify.register(formBody); // Para recibir POST form-urlencoded de Traccar

// Iniciar sesiones Baileys
await startAll();

/**
 * Endpoint compatible con Traccar
 * GET/POST: to, body
 */
async function handleNotify(request, reply) {
  const to = request.query?.to || request.body?.to;
  const body = request.query?.body || request.body?.body || request.body?.message;
  const session = request.query?.session || request.body?.session;

  request.log.info({ to, bodyLength: body?.length, session }, 'Notificación recibida');

  if (!to || !body) {
    return reply.status(400).send({
      error: [{ to: to ? 'ok' : 'is required' }, { body: body ? 'ok' : 'is required' }],
    });
  }

  try {
    const result = await sendMessage(to, body, session || undefined);
    request.log.info({ to, sessionId: result.sessionId }, 'Mensaje enviado OK');
    return reply.send({ success: true, sessionId: result.sessionId });
  } catch (err) {
    request.log.error({ err, to }, 'Error enviando mensaje');
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

// Probar envío manualmente: GET /test-send?to=521234567890&body=Hola&session=numero_1
fastify.get('/test-send', async (request, reply) => {
  const to = request.query?.to;
  const body = request.query?.body || 'Prueba desde WSAPI';
  const session = request.query?.session;
  if (!to) return reply.status(400).send({ error: 'Falta parámetro: to (ej: to=521234567890)' });
  try {
    const result = await sendMessage(to, body, session || undefined);
    return reply.send({ success: true, sessionId: result.sessionId, message: 'Revisa WhatsApp' });
  } catch (err) {
    return reply.status(502).send({ error: err.message });
  }
});

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
    .status { font-weight: bold; display: inline-flex; align-items: center; gap: 0.35rem; }
    .connected { color: #16a34a; }
    .pending { color: #d97706; }
    .icon { font-size: 1.2em; }
    .badge { font-size: 0.75em; padding: 0.15rem 0.4rem; border-radius: 4px; background: #e5e7eb; color: #6b7280; }
    .btn-add { width:28px;height:28px;padding:0;font-size:1.2rem;line-height:1;background:#25D366;color:white;border:none;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center; }
    .btn-add:hover { background:#20bd5a; }
    .msg { margin-left: 0.25rem; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.85em; }
    .msg.err { background: #fee2e2; color: #b91c1c; }
    .msg.ok { background: #d1fae5; color: #047857; }
    .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100; align-items:center; justify-content:center; padding:1rem; }
    .modal.show { display:flex; }
    .modal-inner { background:white; border-radius:12px; max-width:500px; width:100%; max-height:80vh; overflow:hidden; display:flex; flex-direction:column; }
    .modal h3 { margin:0; padding:1rem; border-bottom:1px solid #e5e7eb; }
    .modal-body { padding:1rem; overflow-y:auto; }
    .group-row { display:flex; align-items:center; gap:0.5rem; padding:0.5rem 0; border-bottom:1px solid #f3f4f6; }
    .group-row:last-child { border-bottom:none; }
    .group-id { font-family:monospace; font-size:0.85em; color:#4b5563; word-break:break-all; flex:1; }
    .btn-copy { padding:0.25rem 0.5rem; font-size:0.8em; background:#e5e7eb; border:none; border-radius:4px; cursor:pointer; }
    .btn-copy:hover { background:#d1d5db; }
    .btn-groups { background:#6366f1; margin-left:0.5rem; }
    .btn-groups:hover { background: #4f46e5; }
    .btn-delete { width:28px;height:28px;padding:0;font-size:1rem;background:transparent;color:#9ca3af;border:none;border-radius:4px;cursor:pointer; }
    .btn-delete:hover { background:#fee2e2; color:#dc2626; }
    .badge-click { cursor:pointer; }
    .badge-click:hover { opacity:0.8; }
    .session { display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; }
    .session-content { flex:1; min-width:0; }
  </style>
</head>
<body>
  <h1>WSAPI - Vincular números WhatsApp</h1>
  <p>Selecciona un número para mostrar el código QR. Escanéalo con WhatsApp en el celular.</p>
  <div class="legend" style="color:#6b7280;font-size:0.9rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
    <span>✅ Vinculado · ⏳ Sin vincular · Exclusiva/Dinámica (clic para cambiar)</span>
    <form id="addForm" style="display:inline;">
      <button type="submit" class="btn-add" title="Agregar sesión">+</button>
    </form>
    <span id="addMsg"></span>
  </div>
  <h3 style="margin-top:1.5rem;">Sesiones</h3>
  <div id="sessions"></div>
  <div id="qr" style="display:none;">
    <h3>Escanear con WhatsApp</h3>
    <p id="qrStatus">Generando código QR...</p>
    <img id="qrImg" alt="QR" style="display:none;" />
    <p><small>Escanea desde: WhatsApp → Configuración → Dispositivos vinculados → Vincular dispositivo</small></p>
    <button onclick="document.getElementById('qr').style.display='none'">Cerrar</button>
  </div>
  <div id="deleteModal" class="modal">
    <div class="modal-inner" style="max-width:320px;">
      <h3>Eliminar sesión</h3>
      <div class="modal-body">
        <p style="margin:0 0 0.5rem 0;">Ingresa el PIN para confirmar:</p>
        <input type="password" id="deletePin" placeholder="PIN" style="width:100%;padding:0.5rem;margin-bottom:0.5rem;border:1px solid #ccc;border-radius:4px;" maxlength="6" />
        <span id="deleteMsg"></span>
      </div>
      <div style="padding:1rem; border-top:1px solid #e5e7eb; display:flex; gap:0.5rem;">
        <button onclick="cancelDelete()">Cancelar</button>
        <button id="confirmDeleteBtn" class="btn-delete" style="background:#dc2626;color:white;padding:0.5rem 1rem;">Eliminar</button>
      </div>
    </div>
  </div>
  <div id="groupsModal" class="modal">
    <div class="modal-inner">
      <h3>Grupos de WhatsApp</h3>
      <div class="modal-body" id="groupsList">
        <p>Cargando...</p>
      </div>
      <div style="padding:1rem; border-top:1px solid #e5e7eb;">
        <button onclick="document.getElementById('groupsModal').classList.remove('show')">Cerrar</button>
      </div>
    </div>
  </div>
  <script>
    function renderSessions(list) {
      var div = document.getElementById('sessions');
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var cls = s.connected ? 'connected' : 'pending';
        var icon = s.connected ? '<span class="icon" title="Vinculado">✅</span>' : '<span class="icon" title="Pendiente">⏳</span>';
        var status = s.connected ? 'Vinculado' : 'Sin vincular';
        var fixedToggle = s.fixed
          ? ' <span class="badge badge-click" data-id="' + s.id + '" data-fixed="1" title="Clic para hacer dinámica">Exclusiva</span>'
          : ' <span class="badge badge-click" data-id="' + s.id + '" data-fixed="0" title="Clic para hacer exclusiva">Dinámica</span>';
        var display = s.label || s.id;
        if (s.phone) display += ' <span style="color:#6b7280;font-weight:normal">(' + s.phone + ')</span>';
        else display += ' <span style="color:#9ca3af;font-size:0.85em">(' + s.id + ')</span>';
        var btns = s.connected ? '<button class="btn-groups" data-id="' + s.id + '">Ver grupos</button>' : '<button data-id="' + s.id + '">Mostrar QR</button>';
        html += '<div class="session ' + cls + '"><span class="session-content"><span class="status ' + cls + '">' + icon + status + '</span> ' + fixedToggle + ' ' + display + ' ' + btns + '</span><button class="btn-delete" data-id="' + s.id + '" title="Eliminar">🗑</button></div>';
      }
      div.innerHTML = html || '<p>Cargando...</p>';
      div.querySelectorAll('button[data-id]').forEach(function(btn) {
        var id = btn.getAttribute('data-id');
        if (btn.classList.contains('btn-delete')) {
          btn.onclick = function() { showDeleteModal(id); };
        } else if (btn.classList.contains('btn-groups')) {
          btn.onclick = function() { showGroups(id); };
        } else {
          btn.onclick = function() { showQr(id); };
        }
      });
      div.querySelectorAll('.badge-click').forEach(function(el) {
        el.onclick = function() {
          var id = el.getAttribute('data-id');
          var newFixed = el.getAttribute('data-fixed') !== '1';
          fetch('/api/sessions/' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fixed: newFixed })
          }).then(function(r) { return r.json(); }).then(function(data) {
            if (!data.error) loadSessions();
          });
        };
      });
    }
    var deleteSessionId = null;
    function showDeleteModal(id) {
      deleteSessionId = id;
      document.getElementById('deletePin').value = '';
      document.getElementById('deleteMsg').innerHTML = '';
      document.getElementById('deleteModal').classList.add('show');
      document.getElementById('deletePin').focus();
    }
    function cancelDelete() {
      deleteSessionId = null;
      document.getElementById('deleteModal').classList.remove('show');
    }
    document.getElementById('confirmDeleteBtn').onclick = function() {
      var pin = document.getElementById('deletePin').value;
      var msgDiv = document.getElementById('deleteMsg');
      if (!deleteSessionId) return;
      msgDiv.innerHTML = '';
      fetch('/api/sessions/' + encodeURIComponent(deleteSessionId), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin })
      }).then(function(r) { return r.json().catch(function() { return {}; }); }).then(function(data) {
        if (data.error) {
          msgDiv.innerHTML = '<span class="msg err">' + data.error + '</span>';
          return;
        }
        cancelDelete();
        loadSessions();
      }).catch(function() {
        msgDiv.innerHTML = '<span class="msg err">Error</span>';
      });
    };
    function showGroups(id) {
      var modal = document.getElementById('groupsModal');
      var list = document.getElementById('groupsList');
      modal.classList.add('show');
      list.innerHTML = '<p>Cargando grupos...</p>';
      fetch('/api/sessions/' + encodeURIComponent(id) + '/groups').then(function(r) { return r.json(); }).then(function(data) {
        if (data.error) {
          list.innerHTML = '<p class="msg err">' + data.error + '</p>';
          return;
        }
        var groups = data.groups || [];
        if (groups.length === 0) {
          list.innerHTML = '<p>No hay grupos o la sesión no tiene acceso.</p>';
          return;
        }
        var html = '<p style="margin:0 0 0.5rem 0;font-size:0.9rem;color:#6b7280;">Haz clic en Copiar para usar el ID en Traccar o la API.</p>';
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          html += '<div class="group-row"><div><strong>' + escapeHtml(g.subject) + '</strong><div class="group-id">' + escapeHtml(g.id) + '</div></div><button class="btn-copy" data-id="' + escapeHtml(g.id) + '">Copiar ID</button></div>';
        }
        list.innerHTML = html;
        list.querySelectorAll('.btn-copy').forEach(function(b) {
          b.onclick = function() {
            navigator.clipboard.writeText(b.getAttribute('data-id')).then(function() {
              b.textContent = '¡Copiado!';
              setTimeout(function() { b.textContent = 'Copiar ID'; }, 1500);
            });
          };
        });
      }).catch(function() {
        list.innerHTML = '<p class="msg err">Error al cargar grupos.</p>';
      });
    }
    function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    var pollErrors = 0;
    function loadSessions() {
      fetch('/api/sessions').then(function(r) { return r.json(); }).then(function(data) {
        pollErrors = 0;
        renderSessions(data.sessions || []);
      }).catch(function() {
        pollErrors++;
        document.getElementById('sessions').innerHTML = '<p class="msg err">Servidor no disponible. ¿Reiniciaste WSAPI?</p>';
      });
    }
    document.getElementById('addForm').onsubmit = function(e) {
      e.preventDefault();
      var msgDiv = document.getElementById('addMsg');
      msgDiv.innerHTML = '';
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(function(r) { return r.json().catch(function() { return {}; });
      }).then(function(data) {
        if (data.error) {
          msgDiv.innerHTML = '<span class="msg err">' + data.error + '</span>';
          return;
        }
        msgDiv.innerHTML = '<span class="msg ok">Agregada</span>';
        loadSessions();
        setTimeout(function() { msgDiv.innerHTML = ''; }, 4000);
      }).catch(function() {
        msgDiv.innerHTML = '<span class="msg err">Error</span>';
      });
    };
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
              }).catch(function() { clearInterval(check); });
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
            }).catch(function() { clearInterval(t); qrStatus.textContent = 'Servidor no disponible.'; });
          }
        }).catch(function() { clearInterval(t); qrStatus.textContent = 'Servidor no disponible.'; });
      }, 2000);
    }
    loadSessions();
    var refreshId = setInterval(function() {
      if (pollErrors >= 3) { clearInterval(refreshId); return; }
      loadSessions();
    }, 5000);
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
fastify.get('/api/sessions/:id/groups', async (request, reply) => {
  try {
    const groups = await getSessionGroups(request.params.id);
    return reply.send({ groups });
  } catch (err) {
    return reply.status(400).send({ error: err.message });
  }
});
fastify.patch('/api/sessions/:id', async (request, reply) => {
  try {
    const { fixed } = request.body || {};
    setSessionFixed(request.params.id, fixed === true);
    return reply.send({ success: true, fixed: !!fixed });
  } catch (err) {
    return reply.status(400).send({ error: err.message });
  }
});

fastify.delete('/api/sessions/:id', async (request, reply) => {
  try {
    const pin = request.body?.pin ?? request.query?.pin ?? '';
    if (!validateDeletePin(pin)) {
      return reply.status(403).send({ error: 'PIN incorrecto' });
    }
    removeSession(request.params.id);
    return reply.send({ success: true });
  } catch (err) {
    return reply.status(400).send({ error: err.message });
  }
});

// Añadir nueva sesión (ID automático, label se reemplaza al vincular)
fastify.post('/api/sessions', async (request, reply) => {
  try {
    const { id, label } = request.body || {};
    const sid = (id && String(id).trim()) || `numero_${Date.now()}`;
    const lbl = (label && String(label).trim()) || 'Nueva sesión';
    const newSession = addSession(sid, lbl);
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
