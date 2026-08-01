# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 1 de agosto de 2026 (actualizado)

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg**. Baileys con múltiples números vinculados. Compatible con Traccar. ~2000 mensajes/día repartidos entre ~11 números en 2 VPS.

---

## Decisión Baileys (28 jul 2026)

Hay `baileys@7.0.0-rc14` en npm (RC / pre-estable). **Decidido: quedarnos en `7.0.0-rc13`.**

- Producción estable con rc13 + patch MACOS (`patches/baileys+7.0.0-rc13.patch`).
- Subir a rc14 **no es necesario** mientras no haya fallos (Bad MAC, caídas, rechazo de WhatsApp).
- rc14 tocaría `validate-connection` → habría que **regenerar el parche** y desplegar con cuidado (local → VPS1 → VPS2 + backup `auth_sessions`).
- Próxima actualización seria: cuando salga **7.0.0 estable**, o si rc13 empieza a fallar.

El badge/aviso de “hay versión nueva” puede seguir apareciendo; **ignorar** salvo urgencia.

---

## Estado actual ✅ FUNCIONANDO

### Producción: 2 VPS Hetzner (Pi ya no se usa)

| VPS | IP | Sesiones | Acceso |
|-----|-----|----------|--------|
| **VPS 1 (wsapi-vps)** | 46.225.142.215 | ~5 | SSH directo + consola Hetzner |
| **VPS 2 (halconsat2)** | 46.225.92.152 | ~6 | SSH clave `id_ed25519.pub` |

- **Ambos VPS al día**, mismo código, `settings.json` con alertas a **593997652586**, **Baileys 7.0.0-rc13** (rc14 disponible; **no actualizar** por ahora).
- **Admin WhatsApp:** 593997652586 (0997652586 Ecuador).
- **Ojo consola Hetzner:** el teclado cambia caracteres (`{`→`[`, `"`→`'`, `>`→`.`). Preferir SSH o `setup-vps.sh` / `update.sh`.
- **Pi (192.168.100.6):** liberado. No producción. · **ngrok:** ya no se usa.

### Commits relevantes (resumen)

| Commit | Qué hace |
|--------|----------|
| `e4bd8ff` | Reconexión inteligente + health check cada 2 min |
| `2f050ad`→`04a30d8` | Fix QR sesión nueva |
| `bd21c70` | Fix "Esperando el mensaje" (getMessage + retry máx 3) |
| `96c6d25` | Botón Problemas + onWhatsApp |
| `709b6e6` | Filtro antigüedad + stats + alertas sesión + backup + update.sh |
| `16d9081` | **Baileys → 7.0.0-rc13** |
| `4277ef8` | Chequeo diario versión Baileys |
| `6a953d5`/`7151340` | AUXILIO hasta 60 min · resto **20 min** antigüedad |
| `7391fc9` | Stats del día en **hora Ecuador** (no UTC) |
| `74a971d` | Alerta silencio de tráfico (posible Traccar caído) |
| `ea88d23` | Anti-ráfaga: 1 cada 3 min |
| `3c32fd2` | Historial clicable enviados/descartados/limitados |
| `ec3f56d` | Silencio Traccar: franjas **05–19 / 19–22 / 22–05** → **20 / 30 / 45 min** |
| `debe684` | **ENCENDIDO/APAGADO sin throttle** (igual que AUXILIO/SOS) |
| `3f65c13` | INGRESO/SALIDA flota **CMA/CMP** sin throttle |
| `15743d1` | Historial limitados/descartados con **sessionId** + tipo BATERIA |
| `f1f7506` | CMA/CMP: **sin aviso admin** por ráfaga de INGRESO/SALIDA (sí BATERIA/EXCESO) |
| `75acd29` | Anti-ráfaga: clave incluye **geocerca** (cantón ≠ provincia) |
| `550663e` | Aviso admin **Plantilla no corresponde** (Entrada/Salida mal en Traccar) |

### Panel `/pair`

| Color | Estado |
|-------|--------|
| **Verde** | En línea |
| **Rojo** | Desconectada (reconecta sola o botón Reconectar) |
| **Amarillo** | Sin vincular |
| **Azul** | Conectando… |

- http://46.225.142.215:3000/pair · http://46.225.92.152:3000/pair
- Auto-refresh 5 s · pastillas de resumen
- **Clic en pastillas** enviados / fallidos / descartados / limitados → modal con detalle (muestra del mensaje)
- Botón rojo **"Problemas"** · badge Baileys nueva versión · Exclusiva/Dinámica · contador por sesión

### URLs Traccar

**VPS 1:** `http://46.225.142.215:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`  
**VPS 2:** `http://46.225.92.152:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`  
Por sesión: `&session=numero_XXXX` — IDs en `/api/sessions`

---

## Actualizar código en VPS

```bash
bash /opt/wsapi/update.sh
```

O desde PC: `ssh root@46.225.92.152` / `ssh root@46.225.142.215` + mismo comando.

Si `git pull` falla por `package-lock.json` → `git checkout -- package-lock.json` primero.

---

## settings.json (ambos VPS)

```json
{
  "adminPhone": "593997652586",
  "maxEventAgeMin": 20,
  "auxilioMaxEventAgeMin": 60,
  "trafficSilenceDayMin": 20,
  "trafficSilenceEveningMin": 30,
  "trafficSilenceNightMin": 45,
  "eventThrottleMin": 3,
  "eventBurstCount": 3,
  "eventBurstWindowSec": 60
}
```

Plantillas en repo: `config/settings.example.json` · `config/settings.halconsoft.json`

---

## Funciones activas (detalle)

### Filtro de antigüedad
- Parsea `Hora: YYYY-MM-DD HH:mm:ss` (también dentro de `Fecha y Hora:` de AUXILIO)
- Normal: **20 min** · **AUXILIO: 60 min**
- Descarte → HTTP 200 (Traccar no reintenta)

### Anti-ráfaga (`ea88d23` + geocerca `75acd29`)
- Clave: destino + tipo + placa/unidad + **geocerca** (ej. Santo Domingo ≠ Pichincha; cantón y provincia no se frenan entre sí)
- Máx **1 envío cada 3 min** del mismo evento (misma geocerca)
- ≥3 en 1 min → WhatsApp al admin (máx 1 aviso/10 min por clave)
- **Sin freno** (se envían todas): **AUXILIO/SOS**, **ENCENDIDO/ON**, **APAGADO/OFF**, e **INGRESO/SALIDA** de flota **CMA/CMP** (Mariano Acosta; ej. 10 CMA, 08 CMP)
- **Aviso admin por ráfaga:** normal (BATERIA/EXCESO/SOS/etc.). **Excepción:** INGRESO/SALIDA de CMA/CMP **no** avisan al admin (siguen enviándose a clientes)

### Plantilla no corresponde (`550663e`)
- WSAPI **no ve** el tipo real del evento en Traccar; solo el texto HTTP.
- Aviso admin **"Plantilla no corresponde"** si el título dice SALIDA/INGRESO y el cuerpo dice lo contrario (`ha salido` / `ha ingresado`).
- Aviso **"Posible plantilla no corresponde"** si llegan **dos SALIDA** a geocercas distintas en **menos de 45 s** (caso típico: Entrada con plantilla de Salida, como CAH0132 el 1-ago).
- Máx **1 aviso / 30 min** por caso. Nota en el mensaje: salida cantón + provincia también puede parecerse.
- **Lección 1-ago:** en Eventos se veía Entrada (Pichincha) pero el SMS decía SALIDA; había plantilla mal en Traccar (corregida). Eventos ≠ notificaciones HTTP; además a veces Traccar **duplica** el mismo envío.

### Silencio de tráfico / Traccar caído (`74a971d` / `ec3f56d`)
- Por VPS: si no hay ningún envío real (hora Ecuador)
- **05–19:** 20 min · **19–22:** 30 min · **22–05:** 45 min → alerta al admin
- Primer mensaje tras alerta → aviso de **recuperación inmediato**
- Tras `pm2 restart`: gracia = umbral (evita falsa alarma)
- Las alertas al admin **no** reinician el contador de silencio

### Historial del panel (`3c32fd2` / `15743d1`)
- Clic en pastillas → lista reciente
- Enviados / fallidos / limitados / descartados: fecha, tipo (incl. BATERIA), destino, **sessionId**
- Memoria: máx **300** entradas · TTL **12 h** · se vacía al reiniciar PM2
- API: `GET /api/message-history?kind=sent|failed|discarded_old|throttled`

### Stats del día
- Medianoche **Ecuador** (`America/Guayaquil`), no UTC del VPS
- (Antes se reiniciaba a las 19:00 Ecuador por UTC)

### Alertas sesión caída
- Sesión vinculada >10 min offline → WhatsApp al admin + aviso al recuperar

### Retry "Esperando el mensaje"
- `getMessage` + cache 1 h + máx 3 reintentos

### Problemas (números sin WhatsApp)
- Botón en panel · `config/failed_numbers.json` · muestra del mensaje

### Baileys 7.0.0-rc13 (actual en prod — mantener)
- Patch: `patches/baileys+7.0.0-rc13.patch` (Platform.MACOS)
- Chequeo diario npm → badge + WhatsApp si hay versión nueva
- **rc14 disponible pero descartado por ahora** (RC; riesgo del parche). Ver decisión arriba.

### Backup / scripts
- `backups/auth_YYYY-MM-DD.tar.gz` (últimos 7)
- `update.sh` · `setup-vps.sh`

### Dinámica vs Exclusiva
- **Dinámica:** round-robin (tráfico general sin `&session=`)
- **Exclusiva:** solo con `&session=` (cliente que debe recibir siempre del mismo número)
- Dejar la mayoría dinámicas; exclusiva solo cuando haga falta

---

## Pendiente (para después)

| Tema | Notas |
|------|-------|
| **Baileys rc14 / 7.0 estable** | **No urgente.** Quedamos en rc13. Valorar solo si hay fallos o cuando salga **7.0.0 estable** (noche + snapshot + regenerar patch). |
| **Monitorear Bad MAC** | Comparar con pre-v7; ver si bajan "Esperando el mensaje" en clientes |
| **Revisar botón Problemas** (Andre) | Depurar de Traccar números sin WhatsApp |
| **Panel único 2 VPS** | Una vista con ambos servidores |
| **IDs consecutivos** | `numero_1, 2, 3…` al crear sesión |
| **Proxy Bright Data** | Decidir con stats de uso |
| **Sesión inexistente sin basura** (opcional) | Traccar TDI (`89.117.17.39`) pegaba a VPS1 con `session=numero_1784301738904` ya borrada → clientes **no** reciben (error sesión). Opción: descartar silencioso. Cortar en Traccar es lo correcto. |

**Resueltos jul–ago 2026:** QR · retry · Problemas · filtro antigüedad · stats Ecuador · alertas admin · silencio Traccar · anti-ráfaga (SOS/ON/OFF + CMA/CMP INGRESO/SALIDA libres; sin aviso admin en esas ráfagas) · geocerca en clave throttle · plantilla no corresponde · historial + sessionId · Baileys 7 rc13 (no rc14) · SSH ambos VPS · backups · update.sh.

---

## Si algo falla

```bash
pm2 logs wsapi --lines 50
```

Buscar: `Conexión cerrada`, `Health check`, `Evento descartado`, `throttle`, `Plantilla no corresponde`, `Sin envíos`, `QR generado`, `Ajustes:`.

Sesión roja → **Reconectar** en `/pair` (sin QR).

---

## Recordatorios

- **Clave SSH:** `C:\Users\andre\.ssh\id_ed25519.pub`
- **Nuevo VPS:** `GUIA_INSTALAR_VPS.txt` + `bash setup-vps.sh`
- Actualizaciones Baileys: local → 1 VPS → verificar sin QR → 2.º VPS

---

## Ubicación

| Lugar | Ruta |
|-------|------|
| PC | `c:\Users\andre\halconsoft\wsapi` |
| VPS 1 | `/opt/wsapi` · 46.225.142.215 |
| VPS 2 | `/opt/wsapi` · 46.225.92.152 |
