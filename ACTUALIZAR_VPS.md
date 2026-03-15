# Actualizar VPS con fix de conexión perezosa

El QR se queda en "Generando código..." porque la versión de GitHub conecta todas las sesiones a la vez. Esta copia local tiene el fix.

## Desde tu PC (PowerShell)

```powershell
cd c:\Users\andre\halconsoft\wsapi

scp src/baileys-manager.js root@165.232.158.106:/opt/wsapi/src/
scp src/index.js root@165.232.158.106:/opt/wsapi/src/
```

Luego en el VPS:

```bash
ssh root@165.232.158.106
pm2 restart wsapi
```

Vuelve a abrir http://165.232.158.106:3000/pair y haz clic en "Mostrar QR" en **una sola** sesión.
