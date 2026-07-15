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
| `bd21c70` | **Fix "Esperando el mensaje"**: getMessage + retry (máx 3 intentos) |
| `96c6d25` | **Números con problemas**: botón en panel, onWhatsApp + registro de fallos |
| `709b6e6` | **Filtro antigüedad + stats + alertas admin + backup + update.sh** |

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

**Con un solo comando** (desde `709b6e6`):

```bash
bash /opt/wsapi/update.sh
```

**O manual (consola Hetzner, un comando por línea):**

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
| **VPS 1 desactualizado** | Le faltan TODOS los fixes desde `2f050ad`. Correr `bash /opt/wsapi/update.sh` en consola Hetzner |
| **Crear `settings.json` en VPS** | Para alertas admin y umbral antigüedad (ver sección abajo) |
| **Actualizar Baileys (6.7.21 → reciente)** | Ataca la raíz de los Bad MAC. **Riesgoso** — hacer en ventana de pruebas, revisar patch MACOS |
| **Panel único 2 VPS** | Ver ambos servidores en una vista. Esperar a que VPS 1 esté accesible por SSH |
| **IDs consecutivos (numero_1, 2, 3…)** | Cambio en `POST /api/sessions` |
| **Proxy Bright Data** | ~11 cuentas, 2 VPS |
| **SSH VPS 1** | Añadir `id_ed25519.pub` a authorized_keys — hoy solo consola Hetzner |

---

## Funciones nuevas (`bd21c70` → `709b6e6`)

### Fix "Esperando el mensaje" (`bd21c70`)
- Cache de mensajes enviados (1 h) + `getMessage`: si el cliente no puede descifrar, WhatsApp pide reintento y WSAPI **reenvía automáticamente**
- Máximo **3 reintentos**, luego se descarta (no congestiona)
- Log: `Retry solicitado para mensaje X - reenviando`
- Causa raíz de los "Esperando el mensaje": faltaba `getMessage` + los `Bad MAC` por sesiones Signal corruptas

### Números con problemas (`96c6d25`)
- Botón rojo **"Números con problemas"** en `/pair`
- Verifica con `onWhatsApp` (cache 24 h) si el número existe antes de enviar
- Registra: número, motivo (sin WhatsApp / error envío), **mensaje de muestra** (identifica al cliente por vehículo/placa), intentos, fecha
- Persistido en `config/failed_numbers.json` · botón **Quitar** al depurar de Traccar
- Si el número vuelve a funcionar, sale solo de la lista

### Filtro de antigüedad ✅ IMPLEMENTADO (`709b6e6`)
- Formato confirmado con mensajes reales: `Hora: 2026-07-14 18:12:12` (hora Ecuador, UTC-5)
- Eventos con más de **15 min** → descartados con HTTP 200 (Traccar no reintenta)
- Umbral configurable en `config/settings.json` → `maxEventAgeMin`
- Contador "descartados (viejos)" visible en `/pair` · log `Evento descartado por antigüedad`
- Mensajes sin línea `Hora:` se envían normal

### Estadísticas del día (`709b6e6`)
- `/api/stats` + pastillas en `/pair`: enviados hoy, fallidos, descartados
- Contador por sesión junto a cada número ("123 hoy · 2 err")
- En memoria: se reinician a medianoche o al reiniciar PM2

### Alertas al admin (`709b6e6`)
- Crear `config/settings.json` en cada VPS (copiar de `settings.example.json`):

```json
{ "adminPhone": "5939XXXXXXXX", "maxEventAgeMin": 15 }
```

- Si una sesión vinculada lleva **>10 min caída** sin reconectar → WhatsApp al admin
- También avisa cuando se recupera · **Sin `settings.json` no hay alertas** (todo lo demás funciona igual)

### Backup diario (`709b6e6`)
- `backups/auth_YYYY-MM-DD.tar.gz` (auth_sessions + config), conserva últimos 7
- Primer backup 1 min después de arrancar
- Restaurar: `tar -xzf backups/auth_XXXX.tar.gz -C /opt/wsapi` + `pm2 restart wsapi`

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
