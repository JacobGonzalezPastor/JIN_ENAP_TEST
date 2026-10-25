# Corrección: página sin estilos fuera de la red de la ENAP

**Síntoma:** desde redes externas (datos móviles, otros WiFi) la página cargaba con texto negro sobre fondo oscuro, botones sin estilo y tarjetas desordenadas.

**Causa:** `index.html` obtenía todas las clases de utilidad (`bg-slate-900`, `text-white`, `flex`, `grid`, etc.) desde `https://cdn.tailwindcss.com`, el CDN de desarrollo de Tailwind. Si la red del visitante lo bloquea o no responde, esas clases no existen y solo se aplica `css/app.css`.

**Solución:** se compiló Tailwind 3.4.19 y se guardó como `css/tailwind.css`; `index.html` lo enlaza justo después de `css/app.css` (mismo orden de cascada que tenía el CDN). La página ya no depende de ese servidor para verse bien.

**Al publicar:** subir al servidor `index.html` **y** `css/tailwind.css`. Si el navegador conserva la versión anterior, recargar sin caché.

**Mantenimiento:** si se agregan clases Tailwind nuevas, volver a compilar `css/tailwind.css` con el mismo comando (`tailwindcss -c tailwind.config.js -i in.css -o css/tailwind.css --minify`, con `content` apuntando a `index.html` y `js/**/*.js`).

**Dependencias externas que quedan:** Font Awesome (cdnjs) y Google Fonts (con tipografía de respaldo), Firebase (gstatic) y jsPDF/autotable desde unpkg (solo afecta la exportación a PDF).
