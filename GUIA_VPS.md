# Guía: Comprar y configurar VPS para WSAPI

Esta guía te lleva paso a paso desde cero hasta tener WSAPI funcionando en un servidor 24/7.

---

## 1. Comprar el VPS

### Opción A: Hetzner (recomendado, más económico)

1. Entra a [hetzner.com](https://www.hetzner.com)
2. **Regístrate** → Crear cuenta
3. **Cloud** → **Add Server**
4. Configuración sugerida:
   - **Ubicación**: Nuremberg o Falkenstein (Europa)
   - **Imagen**: Ubuntu 24.04
   - **Tipo**: CX22 o CPX11 (~4-5 €/mes)
   - Añade tu SSH key o deja que te genere una
5. **Create & Buy**

### Opción B: DigitalOcean

1. [digitalocean.com](https://www.digitalocean.com) → Sign up
2. **Create** → **Droplets**
3. Configuración:
   - **Ubuntu 24.04**
   - **Basic** → $6/mes (1 GB RAM)
   - Región más cercana a ti
4. **Create Droplet**

### Opción C: Contabo (muy barato)

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

1. Abre en tu navegador: `http://TU_IP:3000/pair`
2. Para cada uno de los 5 números: clic en **Mostrar QR**
3. En cada celular: **WhatsApp** → **Configuración** → **Dispositivos vinculados** → **Vincular dispositivo**
4. Escanea el QR que aparece en pantalla
5. Cuando todos muestren "✓ Conectado", ya está listo

---

## 9. Configurar Traccar

En la configuración de notificaciones de Traccar, cambia la URL a:

```
http://TU_IP:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%
```

Sustituye `TU_IP` por la IP de tu VPS.

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
