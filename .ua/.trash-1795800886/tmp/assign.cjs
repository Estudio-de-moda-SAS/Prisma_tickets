const fs=require('fs');const N=require('./ua-arch-input.json').fileNodes;
const L=[
['layer:entrada-paginas','Punto de entrada y páginas','Arranque de la SPA React (index.html, main.tsx, App.tsx con MSAL, TanStack Query y React Router) y las páginas enrutadas de PRISMA: tablero Kanban, solicitudes, estadísticas, tareas, administración e integración SOLVI.'],
['layer:ui','Componentes de UI','Componentes React reutilizables y de funcionalidad: layout (Sidebar, Topbar, banners), panel de configuración, tablero Kanban, modales de solicitudes, menciones TipTap, automatizaciones y gráficos de estadísticas con Chart.js.'],
['layer:hooks-dominio','Hooks y lógica de dominio','Hooks personalizados de TanStack Query y lógica de negocio del frontend: CRUD de solicitudes, sprints, equipos, notificaciones, cálculo de métricas de flujo/ANS, generación de exportaciones CSV/XLSX y utilidades de plantillas y menciones.'],
['layer:estado','Estado global (Zustand)','Stores de Zustand para estado de cliente compartido: tablero, filtros, búsqueda, personalización y tema, temporizador, estadísticas, intake y navegación móvil.'],
['layer:integraciones','Autenticación, clientes e integraciones','Capa de acceso a servicios externos desde el frontend: autenticación Entra ID (MSAL) y Supabase, roles, cliente HTTP hacia la Edge Function, cliente Supabase, Microsoft Graph/SharePoint y servicios de la integración SOLVI.'],
['layer:tipos','Tipos y modelos de dominio','Definiciones TypeScript compartidas del dominio (solicitudes, tickets SOLVI, exportaciones, automatizaciones, estadísticas, tipos generados de Supabase) y datos de prueba del tablero.'],
['layer:estilos','Estilos','Hojas de estilo CSS globales y por módulo (variables, tema claro, Kanban, tarjetas, estadísticas, SOLVI, notificaciones) junto con la entrada de Tailwind.'],
['layer:backend','Backend Supabase (Edge Functions)','API REST en Deno desplegada como Supabase Edge Function: router, handlers por recurso, utilidades compartidas (acceso a tableros, notificaciones, correo, mapeos), trabajos de exportación/renombrado y configuración de Supabase.'],
['layer:etl-migraciones','ETL PRISMA Migrations','Sub-paquete Node independiente que migra datos desde Excel hacia PRISMA en fases (resolver, validar, cargar) usando la API del backend.'],
['layer:config-despliegue','Configuración, despliegue y documentación','Configuración de build y herramientas (Vite, PWA, TypeScript, ESLint, Tailwind, PostCSS, TypeDoc), activos públicos y service worker, despliegue en Azure Static Web Apps vía GitHub Actions y documentación del proyecto.'],
];
const pick=x=>{const p=x.filePath,id=x.id;
if(p.startsWith('prisma-migrations/'))return 9-1+0===8?'layer:etl-migraciones':'';
if(p.startsWith('supabase/'))return'layer:backend';
if(p.startsWith('src/styles/')||p==='src/index.css')return'layer:estilos';
if(['src/main.tsx','src/App.tsx','index.html'].includes(p)||p.startsWith('src/pages/'))return'layer:entrada-paginas';
if(p.startsWith('src/store/'))return'layer:estado';
if(/^src\/(auth|lib|graph|api)\//.test(p)||p==='src/config.ts'||p.startsWith('src/features/requests/services/'))return'layer:integraciones';
if(p.startsWith('src/types/')||p==='src/vite-env.d.ts'||/^src\/features\/[^/]+\/types(\.ts|\/)/.test(p)||p==='src/features/requests/templates/types.ts'||p==='src/features/requests/hooks/stats/types.ts'||p.includes('/mock/'))return'layer:tipos';
if(p.startsWith('src/components/hooks/')||p.startsWith('src/hooks/')||/^src\/features\/[^/]+\/(hooks|lib|services)\//.test(p)||p.endsWith('renameUtils.ts'))return'layer:hooks-dominio';
if(p.startsWith('src/components/')||/^src\/features\/[^/]+\/(components|templates)\//.test(p))return'layer:ui';
return'layer:config-despliegue';};
const m={};L.forEach(l=>m[l[0]]=[]);N.forEach(x=>m[pick(x)].push(x.id));
const out=L.map(([id,name,description])=>({id,name,description,nodeIds:m[id]}));
fs.writeFileSync('../intermediate/layers.json',JSON.stringify(out,null,2));
const all=out.flatMap(l=>l.nodeIds);console.log(all.length,new Set(all).size,N.length);out.forEach(l=>console.log(l.id,l.nodeIds.length));
console.log(m['layer:config-despliegue']);console.log(m['layer:tipos']);
