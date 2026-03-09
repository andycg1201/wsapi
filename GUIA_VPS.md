# Guía: Comprar VPS e instalar WSAPI

Esta guía te lleva desde la compra del servidor hasta tener WSAPI funcionando 24/7.

---

## ¿Cuándo necesitas un VPS?

| Situación | Solución |
|-----------|----------|
| **Traccar en VPS de terceros** (tu caso) | ngrok (temporal) o **VPS propio** (definitivo) |
| **Pruebas / desarrollo** | ngrok gratis o localhost |
| **Producción 24/7 sin depender de tu PC** | **VPS propio** |

### ¿Por qué comprar un VPS?

- Tu PC no necesita estar encendida 24/7
- URL fija (no cambia como ngrok gratis)
- Más estable y profesional
- Costo bajo: ~4-6 USD/mes

---

## 1. Comprar el VPS

### Comparativa de proveedores

| Proveedor | Plan | Precio | RAM | Recomendación |
|-----------|------|--------|-----|---------------|
| **Hetzner** | CX22 | ~4 €/mes | 2 GB | Mejor relación calidad-precio |
| **DigitalOcean** | Basic | $6/mes | 1 GB | Muy usado, documentación amplia |
| **Contabo** | VPS S | ~4 €/mes | 4 GB | Mucho RAM, soporte variable |
| **Vultr** | Cloud Compute | $6/mes | 1 GB | Buen rendimiento |

### Paso 1.1: Hetzner (recomendado)

1. Entra a [hetzner.com](https://www.hetzner.com)
2. **Regístrate** → Crear cuenta
3. **Cloud** → **Add Server**
4. Configuración sugerida:
   - **Ubicación**: Nuremberg o Falkenstein (Europa)
   - **Imagen**: Ubuntu 24.04
   - **Tipo**: CX22 o CPX11 (~4-5 €/mes)
   - Añade tu SSH key o deja que te genere una
5. **Create & Buy**

### Paso 1.2: DigitalOcean

1. [digitalocean.com](https://www.digitalocean.com) → Sign up
2. **Create** → **Droplets**
3. Configuración:
   - **Ubuntu 24.04**
   - **Basic** → $6/mes (1 GB RAM)
   - Región más cercana a ti
4. **Create Droplet**

### Paso 1.3: Contabo (más barato, más RAM)

1. [contabo.com](https://contabo.com) → VPS
2. El plan más bajo (~4-5 €/mes) suele incluir 4 GB RAM
3. Ubuntu 24.04

---

## 2. Conectarte al VPS

Tras crear el servidor, recibirás:

- **IP**: por ejemplo `95.217.xxx.xxx`
- **Usuario**: `root`
- **Contraseña** o **clave SSH**

### Desde Windows (PowerShell o CMD)

```bash
ssh root@TU_IP
```

(Reemplaza `TU_IP` con la IP que te dieron)

Si te pide contraseña, ingrésala. La primera vez preguntará si confías en el servidor: escribe `yes`.

---

## 3. Instalar Node.js en el VPS

Una vez conectado por SSH, ejecuta estos comandos uno por uno:

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verificar
node -v
npm -v
```

Deberías ver algo como `v20.x.x` y `10.x.x`.

---

## 4. Subir WSAPI al servidor

### Opción A: Con Git (si tu proyecto está en GitHub)

```bash
# Instalar git si no está
apt install -y git

# Clonar tu repositorio (usa tu URL real)
cd /opt
git clone https://github.com/andycg1201/wsapi.git
cd wsapi
```

### Opción B: Subir archivos manualmente

Desde tu PC, usa **WinSCP** o **FileZilla**:
- Conéctate por SFTP a `TU_IP`, usuario `root`
- Sube la carpeta `wsapi` completa a `/opt/wsapi`

O desde el VPS:

```bash
# Crear carpeta
mkdir -p /opt/wsapi
cd /opt/wsapi

# Luego tendrás que subir los archivos por SCP/WinSCP
```

---

## 5. Instalar dependencias y crear config

```bash
cd /opt/wsapi
npm install
```

Si no existe `config/sessions.json`, créalo:

```bash
# Crear estructura si no existe
mkdir -p config auth_sessions

# Crear sessions.json con 5 números
cat > config/sessions.json << 'EOF'
[
  { "id": "numero_1", "label": "Número 1", "enabled": true },
  { "id": "numero_2", "label": "Número 2", "enabled": true },
  { "id": "numero_3", "label": "Número 3", "enabled": true },
  { "id": "numero_4", "label": "Número 4", "enabled": true },
  { "id": "numero_5", "label": "Número 5", "enabled": true }
]
EOF
```

---

## 6. Ejecutar WSAPI con PM2 (para que no se caiga)

PM2 mantiene la aplicación corriendo y la reinicia si falla.

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar WSAPI
cd /opt/wsapi
pm2 start src/index.js --name wsapi

# Ver que está corriendo
pm2 status

# Configurar para que arranque al reiniciar el servidor
pm2 startup
pm2 save
```

---

## 7. Abrir el puerto en el firewall

```bash
ufw allow 3000
ufw enable
```

(Responde `y` si pregunta)

---

## 8. Vincular los números de WhatsApp

### Opción A: Copiar sesión existente (si ya vinculaste en tu PC)

Si ya tienes `auth_sessions/numero_1` en tu PC funcionando:
1. Usa WinSCP o FileZilla para conectar al VPS
2. Sube la carpeta `auth_sessions/numero_1` a `/opt/wsapi/auth_sessions/`
3. Reinicia: `pm2 restart wsapi`
4. No necesitas escanear QR de nuevo

### Opción B: Vincular desde cero

1. Abre en tu navegador: `http://TU_IP:3000/pair`
2. Para cada número: clic en **Mostrar QR**
3. En cada celular: **WhatsApp** → **Configuración** → **Dispositivos vinculados** → **Vincular dispositivo**
4. Escanea el QR
5. Cuando muestren "✓ Conectado", listo

---

## 9. Configurar Traccar con tu proveedor

Pide a tu proveedor de Traccar que configure la URL (formato compatible con UltraMsg):

```
http://TU_IP:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10
```

Sustituye `TU_IP` por la IP pública de tu VPS.

**Si Traccar usa POST** (template sms.http), configurar:
- URL: `http://TU_IP:3000/messages/chat`
- Template: `to={phone}&body={message}`

---

## Comandos útiles de PM2

| Comando        | Descripción                    |
|----------------|--------------------------------|
| `pm2 status`   | Ver estado de la aplicación    |
| `pm2 logs wsapi` | Ver logs en tiempo real      |
| `pm2 restart wsapi` | Reiniciar aplicación    |
| `pm2 stop wsapi`   | Detener aplicación        |

---

## Problemas frecuentes

**No puedo acceder a /pair desde el navegador**  
- Revisa que el firewall tenga abierto el puerto: `ufw status`  
- Comprueba que WSAPI está corriendo: `pm2 status`

**Los números se desconectan**  
- WhatsApp puede cerrar sesiones si detecta inactividad. Mantén los celulares con internet y con WhatsApp abierto de vez en cuando.

**Quiero usar un dominio en lugar de la IP**  
- Puedes usar **Cloudflare Tunnel** (gratis) o un proxy inverso como **Nginx** con certificado SSL. Si lo necesitas, puedo detallar los pasos.
