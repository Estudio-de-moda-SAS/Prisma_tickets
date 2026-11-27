const fs=require('fs');
const P='src/styles/';
const n=(f,c,s,t,ln)=>{const o={id:'file:'+P+f,type:'file',name:f,filePath:P+f,summary:s,tags:t,complexity:c};if(ln)o.languageNotes=ln;return o;};
const nodes=[
n('LoginPage.css','complex','Estilos de la página de login con prefijo BEM lp-*: fondo animado con orbes y grid, tarjeta dividida con panel de marca y bloque de autenticación con botón de Microsoft. Carga las fuentes Syne y DM Sans desde Google Fonts.',['stylesheet','login','autenticacion','animacion','responsive'],'Usa @keyframes (lp-appear, lp-drift) para animar orbes y la entrada de la tarjeta, y @import url() para fuentes externas.'),
n('automations.css','complex','Hoja de estilos de la página de automatizaciones (auto-*): header, tarjetas de estadísticas, filtros y tarjetas de reglas con badges de estado activa/inactiva/error y visualización del flujo disparador-acción.',['stylesheet','automatizaciones','component','responsive']),
n('clientRequests.css','complex','Estilos de la vista de solicitudes de cliente: header, banner de atención, tabs, toolbar, resumen y tarjetas client-request-card con variantes por prioridad (crítica/alta/media/baja) y estado.',['stylesheet','solicitudes-cliente','component','responsive']),
n('configPanel.css','complex','Hoja de estilos más extensa del proyecto para el panel lateral de configuración (cpanel-*/cp-*): backdrop, navegación lateral, secciones de administración como subequipos, dropdowns, tooltips y exportaciones.',['stylesheet','configuracion','panel-lateral','admin','animacion'],'Panel overlay animado con @keyframes cpanel-slide-in y cpanel-backdrop-in en lugar de un popover.'),
n('customization.css','complex','Estilos del panel BoardCustomization (cp-panel): tabs, secciones, filas por columna del Kanban, selector de color con swatch y valor hex, y footer de acciones para personalizar el tablero.',['stylesheet','personalizacion','kanban','color-picker','component']),
n('feedback.css','moderate','Estilos del modal de feedback y satisfacción (feedback-modal): overlay, header, cuerpo con grilla de severidad, mensajes de error/pista y botones primario/ghost.',['stylesheet','feedback','modal','component','responsive']),
n('filters.css','complex','Estilos del sistema de filtros del tablero (board-filters/filter-*): botón disparador, chips de filtros activos, panel desplegable animado y selector de asignados agrupado con avatares.',['stylesheet','filtros','kanban','dropdown','responsive']),
n('globals.css','simple','Punto de entrada de estilos globales importado por main.tsx; agrega mediante @import las hojas variables, layout, kanban, requestCard, filters y configPanel.',['stylesheet','entry-point','barrel','global-styles'],'Actúa como barrel CSS: el orden de los @import define la cascada (variables primero).'),
n('kanban.css','complex','Estilos del tablero Kanban: contenedor con scroll horizontal y scrollbar personalizado, columnas con colores por estado (backlog, cliente-review, etc.) y selector de columnas con pills para móvil.',['stylesheet','kanban','layout','responsive','component']),
n('kanbanSkeleton.css','complex','Estilos del skeleton de carga del Kanban (sk-*), replicando 1:1 las dimensiones y colores de .kanban y .kanban__col con un efecto shimmer animado.',['stylesheet','skeleton','loading','kanban','animacion']),
n('layout.css','complex','Estilos del layout principal de la aplicación: app-layout, sidebar colapsable con logo, navegación, grupos y subitems, avatar de usuario, backdrop móvil y toast de nueva versión.',['stylesheet','layout','sidebar','navegacion','responsive']),
n('mentions.css','simple','Estilos mínimos para menciones (@usuario) en el input de comentarios: wrapper, input y resaltado .prisma-mention.',['stylesheet','menciones','comentarios','component']),
n('notifications.css','complex','Estilos del centro de notificaciones: campana con badge, panel desplegable animado, lista e items leídos/no leídos con actor, icono y acción de marcar como leído. Define alias de variables CSS hacia variables.css.',['stylesheet','notificaciones','dropdown','component','responsive'],'Declara alias en :root (--text-muted, --text-primary) que remapean a los tokens de variables.css para no reescribir reglas.'),
n('onboarding.css','moderate','Estilos de la tarjeta de onboarding (ob-card) para usuarios nuevos: logo PRISMA, título, campos, error, botón y nota de contacto, con línea de acento superior al estilo del login.',['stylesheet','onboarding','formulario','component','responsive']),
n('requestCard.css','moderate','Estilos de la tarjeta de solicitud del Kanban (request-card): variantes por prioridad, estado de arrastre, avatares de solicitante/resolutor y punto de actividad pulsante.',['stylesheet','request-card','kanban','drag-and-drop','component']),
n('solvi.css','complex','Estilos de la página de tickets de la integración SOLVI: toolbar, búsqueda, banner de error, tabla con columnas redimensionables, pills, paginación y skeleton shimmer.',['stylesheet','solvi','integracion','tabla','responsive']),
n('stats.css','complex','Estilos del panel de estadísticas/métricas (dashboard unificado Sprint + General + Por equipo): barra de control, tabs de vista y equipo, tarjetas de métricas mensuales, chips de sprints, detalle de resolutor y skeletons.',['stylesheet','estadisticas','dashboard','metricas','animacion']),
n('tasks.css','complex','Estilos de la vista de tabla de tareas (tasks-*): layout, toolbar, búsqueda, tabla con columnas por tipo (criticidad, creación, cierre, asignados), avatares apilados y skeleton de carga.',['stylesheet','tareas','tabla','component','responsive']),
n('themeLight.css','moderate','Tema claro activado con data-theme="light" en el elemento html: redefine los tokens de color de variables.css y ajusta overrides para topbar, columnas Kanban, tarjetas, panel de filtros y login.',['stylesheet','theme','light-mode','design-tokens'],'Usa el selector de atributo [data-theme="light"] para sobrescribir custom properties declaradas en :root.'),
n('variables.css','moderate','Define los design tokens globales (custom properties de color, fondo, acento, bordes, texto, sidebar) del tema oscuro por defecto, las fuentes Objektiv Mk3 vía @font-face y overrides de scrollbar.',['stylesheet','design-tokens','theme','configuration','fonts']),
];
const ids=new Set(nodes.map(x=>x.id));
const e=(s,t,type,w)=>({source:'file:'+P+s,target:'file:'+P+t,type,direction:'forward',weight:w});
const edges=[
...['variables.css','layout.css','kanban.css','requestCard.css','filters.css','configPanel.css'].map(t=>e('globals.css',t,'depends_on',0.6)),
e('themeLight.css','variables.css','related',0.5),
e('kanbanSkeleton.css','kanban.css','related',0.5),
e('notifications.css','variables.css','depends_on',0.6),
e('onboarding.css','LoginPage.css','related',0.5),
e('customization.css','kanban.css','related',0.5),
];
for(const x of edges){if(!ids.has(x.source)||!ids.has(x.target))throw new Error(JSON.stringify(x));}
fs.writeFileSync('C:/Dev/Prisma_tickets/.ua/intermediate/batch-17.json',JSON.stringify({nodes,edges},null,1));
console.log(nodes.length,edges.length);
