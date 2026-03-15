# Configurar Traccar para enviar a WSAPI

Si las notificaciones no llegan, **Traccar no está enviando las peticiones** a WSAPI. Debes configurar el canal SMS en el archivo de configuración de Traccar.

---

## Importante: Traccar usa POST, no GET

Traccar envía las notificaciones por **POST** con el cuerpo del mensaje. La URL que usabas con UltraMsg era tipo GET, pero la configuración de Traccar para SMS envía POST.

---

## 1. Ubicación del archivo de configuración

| Sistema | Ruta |
|---------|------|
| **Windows** | `C:\Program Files\Traccar\conf\traccar.xml` |
| **Linux** | `/opt/traccar/conf/traccar.xml` |

---

## 2. Añadir o modificar la configuración SMS

Abre `traccar.xml` y añade o verifica estas líneas **dentro** de la etiqueta `<configuration>`:

```xml
<entry key='notificator.types'>web,sms</entry>
<entry key='sms.http.url'>http://192.168.100.5:3000/messages/chat</entry>
<entry key='sms.http.template'>to={phone}&amp;body={message}</entry>
```

**Cambios que debes hacer:**
- `192.168.100.5` → IP de la PC donde corre WSAPI (o `127.0.0.1` si Traccar está en la misma máquina)
- Si Traccar está en la **misma PC** que WSAPI, usa: `http://127.0.0.1:3000/messages/chat`

---

## 3. Número de teléfono del usuario

El número de WhatsApp debe estar configurado en Traccar:

- En la **interfaz web**: Perfil de usuario → **Teléfono** (formato: 59397652586, con código de país, sin + ni espacios)
- O como atributo del dispositivo, según cómo tengas configurado Traccar

---

## 4. Reiniciar Traccar

Tras guardar `traccar.xml`, reinicia el servicio Traccar para aplicar los cambios.

---

## 5. Probar

1. Asegúrate de que WSAPI esté corriendo (`npm start`)
2. Dispara un evento (geocerca, etc.)
3. Revisa la consola de WSAPI: debe aparecer **"Notificación recibida"**

Si no aparece, Traccar sigue sin llegar a WSAPI. Revisa:
- Que la IP sea correcta
- Que Traccar y WSAPI estén en la misma red (o que Traccar esté en la misma PC)
- Que el firewall permita el puerto 3000

---

## Si Traccar está en un VPS/servidor externo

Si Traccar corre en un **VPS en la nube**, la IP local no será accesible. Opciones:

1. **Instalar WSAPI en el mismo VPS** (recomendado): sigue GUIA_VPS.md
2. **WSAPI en Pi + ngrok** (configuración actual): Traccar usa la URL pública de ngrok:
   - URL: `https://izaiah-multiaxial-mostly.ngrok-free.dev/messages/chat`
   - Template: `to={phone}&body={message}`
