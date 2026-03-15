# Usar el Pi con proxy a través del PC (cuando WhatsApp bloquea al Pi)

Si el Raspberry Pi no puede conectar a WhatsApp (Connection Failure) pero tu PC sí, esta guía hace que el tráfico del Pi salga por el PC usando un túnel SSH.

## Cómo funciona

- **Pi** ejecuta WSAPI
- El tráfico de Baileys (WhatsApp) sale por un túnel SSH hacia el **PC**
- El PC hace la conexión real a WhatsApp → WhatsApp ve la IP del PC (que sí acepta)

## Requisitos

- PC y Pi en la misma red (192.168.100.x)
- PC con Windows y OpenSSH Server instalado

---

## Paso 1: Habilitar OpenSSH Server en el PC (Windows)

1. **Configuración** → **Aplicaciones** → **Características opcionales**
2. **Agregar una característica**
3. Busca **OpenSSH Server** → **Instalar**
4. Reinicia el PC si te lo pide

Para verificar que está corriendo:

```powershell
Get-Service sshd
```

Debe aparecer "Running".

---

## Paso 2: Actualizar WSAPI en el Pi (con soporte proxy)

**Desde tu PC** (PowerShell):

```powershell
cd c:\Users\andre\halconsoft\wsapi
npm install

scp package.json andycg@192.168.100.6:/opt/wsapi/
scp src/baileys-manager.js andycg@192.168.100.6:/opt/wsapi/src/
```

**En el Pi:**

```bash
cd /opt/wsapi
npm install
```

---

## Paso 3: Crear el túnel SSH (desde el Pi hacia el PC)

**En el Pi**, ejecuta (reemplaza `andre` por tu usuario de Windows si es distinto):

```bash
ssh -D 1080 -f -N andre@192.168.100.12
```

- `192.168.100.12` = IP de tu PC (ajústala si es diferente)
- `andre` = tu usuario de Windows
- Esto crea un proxy SOCKS5 en `127.0.0.1:1080` que envía el tráfico por el PC

Te pedirá la contraseña de Windows. Si quieres evitar escribirla cada vez, puedes configurar [clave SSH](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement).

---

## Paso 4: Iniciar WSAPI con proxy en el Pi

```bash
cd /opt/wsapi
WSAPI_PROXY=socks5://127.0.0.1:1080 npm start
```

Deberías ver: `🌐 Usando proxy: socks5://127.0.0.1:1080`

Luego abre `http://192.168.100.6:3000/pair` y haz clic en **"Mostrar QR"** para vincular.

---

## Resumen de comandos

**Cada vez que quieras usar WSAPI en el Pi:**

```bash
# 1. Crear túnel (si no está ya corriendo)
ssh -D 1080 -f -N andre@192.168.100.12

# 2. Iniciar WSAPI
cd /opt/wsapi
WSAPI_PROXY=socks5://127.0.0.1:1080 npm start
```

---

## Notas

- El túnel SSH sigue activo hasta que reinicies el Pi o cierres la sesión. Puedes dejar `ssh -D 1080 -f -N` corriendo en segundo plano.
- Si cambias la IP del PC, actualiza el comando `ssh`.
- Cuando Traccar envíe mensajes, WSAPI correrá en el Pi pero la conexión a WhatsApp saldrá por la IP del PC.
