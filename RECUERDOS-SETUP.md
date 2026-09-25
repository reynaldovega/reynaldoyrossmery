# Activar los recuerdos privados

## Estado

Código preparado; NO está conectado a una cuenta real ni publicado como servicio operativo.
El frontend falla de forma cerrada si no existe API o no está habilitada. No muestra envíos ficticios.
No se necesita enlace público, Google Fotos, clave de Supabase ni contraseña de Google.

## Diseño de acceso

- Cada registro crea una carpeta nueva privada en Drive. Los nombres repetidos no se consultan ni reutilizan.
- Un token AES-256-GCM de 90 días identifica la carpeta. Cookie HttpOnly, Secure y SameSite=Lax en HTTPS; nunca se guarda en localStorage.
- El servidor valida el token, la carpeta y la pertenencia del archivo antes de mostrar medios. No se publican URLs de Drive ni sesiones de subida.
- El enlace de recuperación contiene un token portador: quien lo posea tiene acceso. Se coloca en el fragmento, una página sin recursos externos lo elimina de la dirección y lo canjea por la cookie.
- Salir borra la sesión del navegador, pero no revoca el enlace. Para revocar un espacio, el dueño puede mover su carpeta fuera de la carpeta raíz o enviarla a la papelera. Para revocar todos, cambiar MEMORIES_SESSION_KEY. Mantener la clave entre despliegues normales.
- El administrador usa su Drive para consultar/descargar carpetas por invitado. No se añade un panel administrativo público.
- Los invitados pueden agregar, ver y descargar. No pueden borrar archivos en esta primera versión.
- Sesiones de carga temporales viven en memoria durante 30 minutos. Si se reinicia el servidor, hay que seleccionar de nuevo las cargas pendientes. Las fotos ya guardadas permanecen en Drive.

## 1. Autorizar Google Drive (acción del propietario)

1. Abrir https://console.cloud.google.com/ con la cuenta propietaria y crear o elegir un proyecto para esta boda.
2. Habilitar **Google Drive API**. Configurar Google Auth Platform / OAuth para uso externo. Usar únicamente el alcance `https://www.googleapis.com/auth/drive.file` (archivos creados por esta aplicación).
3. En modo Testing, añadir la cuenta del propietario como usuario de prueba. Google caduca los refresh tokens de Testing a los 7 días: para recoger recuerdos por más tiempo, pasar el consentimiento a Production según lo permita Google y volver a autorizar. Verificar esta condición antes del evento; no desactivar advertencias del navegador.
4. Crear un cliente OAuth de tipo **Web application**, con URI de redirección autorizada exactamente `http://127.0.0.1:8788/callback`.
5. Copiar `.env.example` a `.env` y completar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET localmente. No pegarlos en chats ni subirlos a GitHub.
6. Ejecutar `npm run connect-drive`. El propietario abre la URL mostrada y autoriza. El asistente crea una carpeta privada, guarda el refresh token y una clave aleatoria en `.env`; no imprime secretos. No otorga acceso a todos los archivos del Drive.

## 2. Prueba real local

1. Mantener PUBLIC_ORIGIN=http://127.0.0.1:8787. Poner MEMORIES_ENABLED=true en `.env` y ejecutar `npm start`.
2. Abrir http://127.0.0.1:8787/#recuerdos. Crear un invitado, subir una foto de prueba y un video, recargar y descargarlos.
3. En otro perfil/navegador, repetir el mismo nombre: la galería debe empezar vacía. Una URL de archivo del primer perfil debe responder 404 desde el segundo.
4. Guardar enlace privado; abrirlo en un tercer navegador y comprobar que recupera el primer espacio.
5. Verificar en Drive que solo el propietario tenga acceso a la carpeta raíz. El servidor se cierra si detecta permisos compartidos allí. No compartir manualmente subcarpetas ni archivos.

## 3. Publicar sin afectar la invitación actual

El Render actual es un **Static Site**: no ejecutará el backend. Crear un **Web Service nuevo** del mismo repositorio, con Node 24, `npm install --omit=dev` y `npm start`. Hay un ejemplo en `server/render-memories.yaml`; no reemplazar `render.yaml`.

Configurar en Environment las variables de `.env`, con PUBLIC_ORIGIN igual al origen HTTPS real del servicio nuevo. Mantener MEMORIES_SESSION_KEY y los datos de Drive. No incluir una barra final ni ruta en PUBLIC_ORIGIN. Habilitar MEMORIES_ENABLED solo después de completar la configuración.

El plan Free puede servir para validar, pero se suspende tras inactividad y tiene límites de tráfico; las cargas y visualizaciones de videos consumen transferencia. No se garantiza gratuidad ni disponibilidad inmediata el día de la boda. Cualquier plan de pago requiere elección del propietario.

Antes de publicar, **revisar el volumen ya utilizado y los cargos automáticos de tráfico en Render**. Para el evento con muchas cargas, confirmar el plan con el dueño. No hay contratación automática.

La nueva aplicación sirve la misma invitación en su propio dominio. Tras verificarla, actualizar los enlaces `#recuerdos` del sitio original para que naveguen al origen nuevo con `/#recuerdos`. Esto evita cookies de terceros. Generar el QR solo después de fijar y probar esa URL. No cambiar el QR a un enlace de recuperación individual.

## Límites iniciales

100 MiB por archivo, 1 GiB por invitado y 30 GiB para el evento. Se reservan al menos 2 GiB de espacio libre en la cuenta. Los valores son conservadores; no eliminan el costo potencial de tráfico. Hasta 20 archivos seleccionados por tanda. Subidas secuenciales con progreso, firma básica de formato, sin SVG/HTML, videos transmitidos sin cargarlos enteros en la memoria del servidor.

Los cálculos de cuota consultan Drive y agregan las reservas locales; esta versión está diseñada para UNA instancia. No escalar a varias instancias sin un registro transaccional compartido. Las cuotas de Drive y su disponibilidad siguen siendo externas. Después de una conexión interrumpida, actualizar la galería antes de reenviar para evitar duplicados. No hay reanudación parcial del lado del navegador en esta versión.

## Verificación automatizada

`npm test`: casos HTTP con un Drive falso aislado. Prueban nombres duplicados, tokens manipulados, lectura cruzada, carga cruzada, recuperación, contenido no permitido, cuotas y cierre sin configuración. No equivalen a probar una cuenta real de Drive.

Fuentes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth · https://developers.google.com/identity/protocols/oauth2 · https://developers.google.com/workspace/drive/api/guides/manage-uploads · https://render.com/docs/free
