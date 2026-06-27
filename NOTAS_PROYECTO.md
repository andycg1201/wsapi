# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 27 de junio de 2026 (actualizado)

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
| `2f050ad` | Fix QR sesión nueva: no usar `reconnectSession` sin credenciales |
| `430ab7a` | Fix QR: no reiniciar conexión si el QR ya está listo |
| `04a30d8` | Fix QR: esperar hasta 20 s mientras Baileys genera el código |

**Reconexión (`e4bd8ff`):**
- Reintento 2 s / 5 s / 15 s según código de error WhatsApp
- Log del motivo en `pm2 logs` (401, 515, 428, etc.)
- Corrige sockets “muertos” que bloqueaban reconectar
- Health check: si sesión vinculada queda roja >2 min → reconecta sola
- **No requiere re-escanear QR** al desplegar cambios de reconexión/keep-alive

**Vincular sesión nueva (`2f050ad` → `04a30d8`):**
- Al pulsar **+** se crea la sesión; al pulsar **Mostrar QR** (o auto al crear) se conecta **bajo demanda**
- `/api/qr/:id` espera hasta 20 s en servidor — no responde vacío antes de tiempo
- **No reinicia** la conexión si el QR ya está generado (evita borrarlo en cada poll)
- Sesión sin vincular que se cae → no reintenta en bucle; espera nuevo clic en **Mostrar QR**
- Log útil: `[id] QR generado - visible en /pair`
- **Desplegado en VPS 2** · **VPS 1 pendiente** `git pull` por consola Hetzner

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

Buscar: `Conexión cerrada (código …)`, `Health check`, `Reconectando en X s`, `QR generado`.

Sesión roja persistente → **Reconectar** en `/pair` (sin QR).

**QR no aparece al crear sesión:**
1. Confirmar que el VPS tiene `04a30d8` o posterior (`git log -1 --oneline` en `/opt/wsapi`)
2. Pulsar **Mostrar QR** y esperar ~5–15 s
3. `pm2 logs wsapi --lines 30` — debe salir `QR generado`
4. Si sale `QR refs attempts ended` → pulsar **Mostrar QR** de nuevo (el código expiró)

---

## Pendiente (para después)

| Tema | Notas |
|------|-------|
| **Filtro antigüedad de eventos** | Ver sección abajo — **próximo a implementar** |
| **Lista números con error de envío** | Botón en panel |
| **IDs consecutivos (numero_1, 2, 3…)** | Cambio en `POST /api/sessions` |
| **Proxy Bright Data** | ~11 cuentas, 2 VPS |
| **SSH VPS 1** | Añadir `id_ed25519.pub` a authorized_keys — hoy solo consola Hetzner |
| **VPS 1 sin fix QR** | `git pull` + `pm2 restart wsapi` en consola (VPS 2 ya actualizado) |

---

## Filtro de notificaciones a destiempo (pendiente — acordado, sin código aún)

### Problema

Si WSAPI o Traccar cae (ej. 18:00–19:00), al volver Traccar reenvía el **backlog** de eventos. Los clientes reciben alertas viejas (ej. geocerca de las 18:15 llegando a las 19:00).

### Limitación Traccar

La URL HTTP solo expone **`%NUMBER%`** y **`%MESSAGE%`**. No hay `eventTime` ni timestamp en query string.

### Solución acordada

1. Incluir en la **plantilla Traccar** la línea `Hora: %DT_POS%` (fecha/hora de la **posición** del evento; no usar `%DT_SER%`).
2. En WSAPI (`handleNotify` / `src/index.js`): **parsear** esa línea del `body` recibido.
3. Si el evento tiene más de **15 minutos** de antigüedad → **descartar** el envío + log (y opcional contador en panel).

**Plantilla ejemplo (Traccar):**

```
EXCESO VELOCIDAD
... %NAME%, %PL_NUM%, %SPEED%, %ADDRESS%, %G_MAP%
Hora: %DT_POS%
```

**Umbral:** 15 min (configurable vía env si hace falta).

### Antes de implementar

Pedir **2–3 mensajes reales** ya renderizados por Traccar para fijar:
- Formato exacto de `%DT_POS%` (fecha, hora, separadores)
- Zona horaria (Ecuador)

Sin eso el parser puede fallar en casos reales.

### Implementación prevista (cuando digas)

| Paso | Dónde |
|------|--------|
| Parser `Hora:` en body | `src/index.js` → `handleNotify` |
| Umbral 15 min + env opcional | `.env` / config |
| Log + stats descartados | logs PM2; opcional badge en `/pair` |
| Documentar plantilla | `CONFIGURAR_TRACCAR.md` |

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
