# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 16 de marzo de 2026 (actualizado)

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg**. Baileys con múltiples números vinculados. Compatible con Traccar. ~2000 mensajes/día repartidos entre ~11 números en 2 VPS.

---

## Estado actual ✅ FUNCIONANDO

### Producción: 2 VPS Hetzner (Pi ya no se usa)

| VPS | IP | Sesiones | Acceso |
|-----|-----|----------|--------|
| **wsapi-vps** | 46.225.142.215 | ~5 | Consola Hetzner |
| **VPS 2** | 46.225.92.152 | ~6 | SSH clave `id_ed25519.pub` |

- **Pi (192.168.100.6):** liberado. No producción.
- **ngrok:** ya no se usa.

### Estabilidad de sesiones ✅

| Commit | Qué hace |
|--------|----------|
| `5ad5afb` | Keep-alive: presencia cada 10 min, `markOnlineOnConnect` |
| `29647c7` | Panel: pastillas verde/rojo/amarillo/azul + Reconectar |
| `e4bd8ff` | **Reconexión inteligente** + health check cada 2 min |

**Reconexión (`e4bd8ff`):**
- Reintento 2 s / 5 s / 15 s según código de error WhatsApp
- Log del motivo en `pm2 logs` (401, 515, 428, etc.)
- Corrige sockets “muertos” que bloqueaban reconectar
- Health check: si sesión vinculada queda roja >2 min → reconecta sola
- **No requiere re-escanear QR** al desplegar

### Panel `/pair`

| Color | Estado |
|-------|--------|
| **Verde** | En línea |
| **Rojo** | Desconectada (reconecta sola o botón Reconectar) |
| **Amarillo** | Sin vincular |
| **Azul** | Conectando… |

- Auto-refresh cada 5 s · Resumen arriba (X en línea · Y desconectadas)
- http://46.225.142.215:3000/pair · http://46.225.92.152:3000/pair

### URLs Traccar

**VPS 1:** `http://46.225.142.215:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`  
**VPS 2:** `http://46.225.92.152:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`  
Por sesión: `&session=numero_1` — IDs en `/api/sessions`

---

## Actualizar código en VPS

**Consola Hetzner:** un comando por línea (no pegar `&&`):

```bash
cd /opt/wsapi
```
```bash
git pull origin main
```
```bash
npm install
```
```bash
pm2 restart wsapi
```
```bash
pm2 status
```

**VPS 2 desde PC:** `ssh root@46.225.92.152` + mismos comandos.

---

## Si algo falla

```bash
pm2 logs wsapi --lines 50
```

Buscar: `Conexión cerrada (código …)`, `Health check`, `Reconectando en X s`.

Sesión roja persistente → **Reconectar** en `/pair` (sin QR).

---

## Pendiente (para después)

| Tema | Notas |
|------|-------|
| **Lista números con error de envío** | Botón en panel |
| **IDs consecutivos (numero_1, 2, 3…)** | Cambio en `POST /api/sessions` |
| **Proxy Bright Data** | ~11 cuentas, 2 VPS |
| **SSH VPS 1** | Añadir `id_ed25519.pub` a authorized_keys |

---

## Recordatorios

- **Clave SSH:** `C:\Users\andre\.ssh\id_ed25519.pub` (pública)
- **Contraseña VPS:** Hetzner → Console o Rescue
- **Nuevo VPS:** `GUIA_INSTALAR_VPS.txt`
- **UltraMsg vs Baileys:** puede haber caídas puntuales; reconexión automática mitiga pero no es 100 %

---

## Proxy (planificado)

Bright Data · SOCKS5 · “apliquemos proxy” cuando digas.

---

## Ubicación

| Lugar | Ruta |
|-------|------|
| PC | `c:\Users\andre\halconsoft\wsapi` |
| VPS 1 | `/opt/wsapi` · 46.225.142.215 |
| VPS 2 | `/opt/wsapi` · 46.225.92.152 |
