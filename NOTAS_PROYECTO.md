# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 16 de marzo de 2026 (actualizado)

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg** (para ahorrar costo). Usa Baileys con múltiples números de WhatsApp vinculados directamente. Compatible con Traccar.

---

## Estado actual ✅ FUNCIONANDO

### Dos instancias en producción

| Instancia | Ubicación | IP/URL | Uso |
|-----------|-----------|--------|-----|
| **Pi** | Raspberry Pi | 192.168.100.6 + ngrok | Sesiones originales, Traccar vía ngrok |
| **VPS** | Hetzner Nuremberg | 46.225.142.215 | Sesiones nuevas, acceso directo |

### Lo que ya funciona

- **Notificaciones operativas** - Traccar envía a WSAPI y los mensajes llegan a WhatsApp
- **Múltiples números** - Sesiones con round-robin o fijas (`session=numero_X`)
- **Envío a grupos** - Usar ID de grupo: `to=1234567890-9876543210@g.us`

### Panel `/pair` - Funciones

| Función | Descripción |
|---------|-------------|
| ✅/⏳ | Iconos: Vinculado / Sin vincular |
| Exclusiva/Dinámica | Badge clicable: alterna entre sesión fija o round-robin |
| **+** | Botón circular: agregar sesión (ID automático) |
| Ver grupos | Lista grupos WhatsApp y permite copiar ID |
| 🗑 | Eliminar sesión (PIN: 1980) |

- Al vincular: se muestra número de teléfono y nombre de WhatsApp automáticamente
- **Exclusiva** = solo se usa con `?session=numero_X`; **Dinámica** = entra en round-robin

### URLs Traccar

**Pi (ngrok):**
```
https://izaiah-multiaxial-mostly.ngrok-free.dev/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10
```

**VPS (directo):**
```
http://46.225.142.215:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10
```
Por sesión: añadir `&session=numero_1` (o numero_2, etc.)

### Configuración

- **Pi:** systemd (ngrok + wsapi), arranque automático al encender
- **VPS:** PM2 (wsapi), Hetzner CPX22 Nuremberg
- **Ver sesiones/IDs:** `http://46.225.142.215:3000/api/sessions`

---

## Para continuar

### Si algo deja de funcionar

**Pi:**
```bash
ssh andycg@192.168.100.6
sudo systemctl status ngrok wsapi
sudo systemctl restart wsapi   # o ngrok
```
Panel: `http://192.168.100.6:3000/pair`

**VPS:**
```bash
ssh root@46.225.142.215
pm2 status
pm2 restart wsapi
```
Panel: `http://46.225.142.215:3000/pair`

### Vincular más números

Pi: `https://izaiah-multiaxial-mostly.ngrok-free.dev/pair`  
VPS: `http://46.225.142.215:3000/pair`  
Clic en **+** → Mostrar QR → escanear (una sesión a la vez)

### Actualizar código

**Pi:**
```bash
ssh andycg@192.168.100.6
cd /opt/wsapi && git pull origin main && npm install && sudo systemctl restart wsapi
```

**VPS:**
```bash
ssh root@46.225.142.215
cd /opt/wsapi && git pull origin main && npm install && pm2 restart wsapi
```

---

## Comandos útiles

```bash
# PC (desarrollo)
npm start
npm run dev

# Pi
ssh andycg@192.168.100.6
sudo systemctl status ngrok wsapi

# VPS
ssh root@46.225.142.215
pm2 status
pm2 logs wsapi
```

---

## API relevante

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/sessions` | Estado de sesiones |
| POST | `/api/sessions` | Agregar sesión (body vacío = ID auto) |
| PATCH | `/api/sessions/:id` | Cambiar fijo (body: `{ "fixed": true/false }`) |
| DELETE | `/api/sessions/:id` | Eliminar sesión (body: `{ "pin": "1980" }`) |
| GET | `/api/sessions/:id/groups` | Grupos de una sesión conectada |

---

## Archivos clave

- `config/sessions.json` - Sesiones (phone, label se auto-actualizan)
- `auth_sessions/` - Credenciales WhatsApp (no subir a git)
- `GUIA_INSTALAR_VPS.txt` - **Guía completa** para instalar en nuevo VPS (sin ayuda)
- `CONFIGURAR_TRACCAR.md` - Guía Traccar (SMS POST)
- `GUIA_VPS.md` - Comprar VPS e instalar WSAPI
- `VPS_PARALELA.md` - Pi intacto, VPS para sesiones nuevas

---

## VPS Hetzner ✅ FUNCIONANDO

- **IP:** 46.225.142.215
- **Panel:** http://46.225.142.215:3000/pair
- **Sesiones:** numero_1, numero_2, etc. (ver `/api/sessions`)
- **Renombrar sesión:** editar `config/sessions.json` + renombrar carpeta en `auth_sessions/` + `pm2 restart wsapi`

---

## Recordatorios (última sesión)

- **Hetzner – SSH key:** Siempre la misma clave que ya usas (Pi, VPS anterior). No crear otra.
- **Contraseña VPS olvidada:** Hetzner → Rescue → Enable → Console → mount + chroot + passwd root → reboot → Disable Rescue
- **ID sesión largo (numero_1773695055107):** Se genera con el botón +. Para acortar: editar sessions.json + renombrar auth_sessions/ + pm2 restart
- **Instalar en nuevo VPS:** Seguir `GUIA_INSTALAR_VPS.txt` (todo en un archivo)

---

## Proxy (planificado)

**Contexto:** ~10 cuentas, ~2000 mensajes/día → riesgo de ban. Se planea usar proxy para reducir.

### Proveedor recomendado: **Bright Data**
- Web: [brightdata.com](https://brightdata.com)
- SOCKS5 residencial, trial gratis, alta fiabilidad para WhatsApp

### Implementación (cuando digas "apliquemos proxy")

1. **Código:** Añadir soporte proxy opcional en `baileys-manager.js`
   - `socks-proxy-agent` como dependencia
   - Config por sesión en `config/sessions.json` (ej. `proxy: "socks5://user:pass@host:port"`)
   - Por defecto: sin proxy (no afecta lo que ya funciona)

2. **Comportamiento:** Sesión con proxy configurado → reconexión breve usando proxy, **sin** escanear QR de nuevo

3. **Estrategia sugerida:** 2-3 proxies, 3-4 cuentas por proxy (opción B de coste/riesgo equilibrado)

---

## Ubicación del proyecto

| Lugar | Ruta / Acceso |
|-------|---------------|
| PC (desarrollo) | `c:\Users\andre\halconsoft\wsapi` |
| Raspberry Pi | `/opt/wsapi` · `ssh andycg@192.168.100.6` |
| VPS Hetzner | `/opt/wsapi` · `ssh root@46.225.142.215` |
