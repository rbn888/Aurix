# Acceso móvil desde X — publicación y prueba

## Cambio preparado

Login build 499. Se conserva el formulario de email y código dentro de X y otros navegadores integrados reconocidos. La ayuda para cambiar de navegador es opcional y está plegada. No cambia la autenticación del servidor, las sesiones ni los datos de usuarios. No requiere instalar nada en el teléfono.

## Publicación habitual

El repositorio es `rbn888/Aurix`. El workflow `.github/workflows/pages.yml` publica al incorporar los cambios a `main`, después del escaneo de secretos y el gate completo. La rama de trabajo actual no es `main`: no basta con subir esta rama para publicar.

Incorporar juntos los cambios de `login.html`, `version.json`, `docs/AURIX-AUTH-EMBEDDED-BROWSER-CONVERSION-harness.js`, `docs/launch-conversion/probe-x-entry.mjs` y este documento. No incluir los archivos de imágenes u otros trabajos locales ajenos a este arreglo. Si main tiene una versión de login posterior a 499, asignar un número superior en ambos archivos de versión; no reducirla.

En GitHub Actions, comprobar que “Deploy to GitHub Pages” termina correctamente. El ZIP del sitio generado es un artefacto estático de respaldo, no incluye las funciones API de Vercel. No sustituir todo el proyecto de Vercel por este ZIP.

## Verificación publicada

Abrir https://app.aurixsystem.io/version.json y comprobar `loginhtml` 499 (o el número superior elegido al integrar). Abrir https://app.aurixsystem.io/login.html?lang=es. Si sigue viéndose la pantalla antigua, recargar y comprobar primero la versión publicada, sin borrar datos ni cerrar sesiones innecesariamente.

## Prueba en el móvil

1. Desde el enlace real de una publicación de X de Aurix, llegar al acceso. Debe aparecer “Tu correo electrónico” y “Enviar código de acceso”, sin obligar a copiar enlaces.
2. Introducir tu email, pedir el código y volver desde el correo a la misma pestaña de X para introducirlo. Debe entrar en Aurix sin regresar al login en bucle.
3. Abrir otra vez Aurix dentro del mismo navegador y comprobar la sesión.
4. Repetir desde Safari en iPhone y Chrome en Android, y desde enlaces en Instagram/Telegram si se usan. Una sesión de otro navegador puede requerir un nuevo código; eso no significa que se haya perdido la cuenta.
5. Desplegar la ayuda opcional. En iPhone ofrece instrucciones y copiar enlace; en Android también ofrece intentar abrir el navegador. Si copiar falla, debe indicarlo.
6. Comprobar ES y EN. En un ordenador, el acceso normal debe seguir disponible.

Las pruebas locales no certifican las WebViews ni los menús de un iPhone/Android físico. No se han enviado códigos reales durante la preparación.

## Reversión

Revertir únicamente el cambio de acceso si fuera necesario, conservando el número de login creciente para invalidar cachés. No revertir datos, sesiones ni cambios independientes del repositorio.

## Validación de esta entrega

Control completo de publicación: 302/302 harnesses correctos, 0 fallos (462 segundos). Escaneo de secretos correcto. Ensamblado estático: 74 archivos, 0 referencias sin resolver y 0 archivos internos publicados. Prueba de email/OTP real y WebViews físicas pendiente tras publicar.
