# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 16 de marzo de 2026 (actualizado)

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg**. Baileys con múltiples números vinculados. Compatible con Traccar. ~2000 mensajes/día repartidos entre ~11 números.

---

## Estado actual ✅ FUNCIONANDO

### Producción: 2 VPS Hetzner (Pi ya no se usa)

| VPS | IP | Sesiones | Acceso SSH |
|-----|-----|----------|------------|
| **wsapi-vps** | 46.225.142.215 | ~5 | Consola Hetzner o contraseña root |
| **VPS 2** | 46.225.92.152 | ~6 | Clave SSH (`id_ed25519.pub`) |

- **Pi (192.168.100.6):** liberado para otro proyecto. Ya no es producción WSAPI.
- **ngrok:** ya no se usa para Traccar (solo VPS directo).

### Keep-alive sesiones ✅ (marzo 2026)

**Problema:** sesiones “dormidas” en Dispositivos vinculados (última actividad hace días); clientes veían *“Esperando el mensaje…”*.

**Solución aplicada** (`baileys-manager.js`, commit `5ad5afb`):
- `markOnlineOnConnect: true`
- Presencia “disponible” cada 10 min
- Ping socket cada 30 s

**Desplegado en ambas VPS** — no requirió re-escanear QR.

**Actualizar en VPS:**
```bash
cd /opt/wsapi && git pull origin main && npm install && pm2 restart wsapi
```

### URLs Traccar

**VPS 1 (5 sesiones):**
```
http://46.225.142.215:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10
```

**VPS 2 (6 sesiones):**
```
http://46.225.92.152:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10
```

Por sesión: `&session=numero_1` (ver IDs en `/api/sessions`).

### Panel `/pair`

| VPS | URL |
|-----|-----|
| VPS 1 | http://46.225.142.215:3000/pair |
| VPS 2 | http://46.225.92.152:3000/pair |

Funciones: ✅/⏳, Exclusiva/Dinámica, +, Ver grupos, 🗑 (PIN 1980).

---

## Si algo falla

**VPS 1** (consola Hetzner si SSH no entra):
```bash
cd /opt/wsapi
pm2 status
pm2 restart wsapi
pm2 logs wsapi
```

**VPS 2:**
```bash
ssh root@46.225.92.152
cd /opt/wsapi && pm2 restart wsapi
```

---

## Pendiente (para después)

| Tema | Notas |
|------|-------|
| **Lista números con error de envío** | Botón en panel; no incluye “Esperando el mensaje” |
| **IDs consecutivos (numero_1, 2, 3…)** | Requiere cambio en `POST /api/sessions` |
| **Proxy Bright Data** | ~11 cuentas, 2 VPS; ver sección Proxy abajo |
| **SSH VPS 1** | Añadir `id_ed25519.pub` a authorized_keys para entrar sin contraseña |

---

## Recordatorios

- **SSH key Hetzner:** misma clave pública → `C:\Users\andre\.ssh\id_ed25519.pub` (no la privada)
- **Contraseña VPS:** Hetzner → Console o Rescue → `passwd root`
- **ID sesión largo (`numero_1773695055107`):** renombrar en `sessions.json` + carpeta `auth_sessions/` + `pm2 restart`
- **Nuevo VPS:** `GUIA_INSTALAR_VPS.txt`

---

## Proxy (planificado)

- **Proveedor:** Bright Data (SOCKS5 residencial)
- **Cuándo:** “apliquemos proxy” → opcional por sesión en `sessions.json`
- **Estrategia:** 2–3 proxies, 3–4 cuentas por proxy

---

## Archivos clave

- `config/sessions.json` — sesiones (phone, label auto)
- `auth_sessions/` — credenciales (no subir a git)
- `GUIA_INSTALAR_VPS.txt` — instalar VPS desde cero
- `CONFIGURAR_TRACCAR.md` — Traccar SMS POST

---

## Ubicación

| Lugar | Ruta / Acceso |
|-------|---------------|
| PC desarrollo | `c:\Users\andre\halconsoft\wsapi` |
| VPS 1 | `/opt/wsapi` · 46.225.142.215 |
| VPS 2 | `/opt/wsapi` · 46.225.92.152 |
| Pi (legacy) | `/opt/wsapi` · 192.168.100.6 — no producción |
