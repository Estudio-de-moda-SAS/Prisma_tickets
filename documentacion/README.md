# Documentación de PRISMA

Documentación de producto y arquitectura de PRISMA, escrita a mano y versionada junto con el código (a diferencia de `docs/`, que es la salida generada por TypeDoc a partir de los comentarios TSDoc del código, y está excluida del control de versiones — ver [`README.md`](../README.md) de la raíz, sección "Documentación técnica").

Combina documentación **técnica** (arquitectura, acciones de la API, tablas de base de datos) y **funcional/de usuario** (qué hace cada módulo, quién lo usa, cómo). Está pensada tanto para alguien nuevo en el equipo de desarrollo como para soporte/negocio que necesita entender qué hace una función del sistema.

> Generada a partir de una revisión del código fuente en septiembre de 2026. El código es la fuente de verdad — si algo cambia, actualizar el documento correspondiente en el mismo PR.

## Por dónde empezar

- **¿Nuevo en el proyecto?** Empezá por [`ARQUITECTURA.md`](ARQUITECTURA.md): explica el principio de punto único de entrada, el ciclo de vida de una petición, autenticación/autorización, la estructura del repo, las convenciones de desarrollo y, en su §8, los **riesgos y puntos frágiles conocidos** del sistema.
- **¿Necesitás entender una tabla de la base de datos?** [`BASE_DE_DATOS.md`](BASE_DE_DATOS.md) mapea las 49 tablas en uso, agrupadas por dominio, con columnas, tipos y relaciones — reconstruido leyendo el código de la Edge Function, porque el repo no tiene migraciones SQL versionadas ni un esquema siempre actualizado.
- **¿Vas a trabajar en una funcionalidad puntual?** Andá directo al documento de módulo correspondiente en [`modulos/`](modulos/).
- **¿Te interesa hacia dónde debería evolucionar el backend?** [`PROPUESTA_DEUDA_TECNICA.md`](PROPUESTA_DEUDA_TECNICA.md) evalúa separar el backend, seguir creciendo la Edge Function única o particionarla en varias — con una recomendación concreta. Es una propuesta para discusión, no una arquitectura ya decidida.
- **¿Vas a planificar la ejecución de esa propuesta?** [`ROADMAP_DEUDA_TECNICA.md`](ROADMAP_DEUDA_TECNICA.md) desglosa el camino recomendado en historias tipo Scrum (orden, dependencias, criterios de aceptación, tamaño relativo).

## Índice de módulos

| # | Módulo | Qué cubre |
|---|---|---|
| 01 | [Tickets y Tablero Kanban](modulos/01-tickets-y-kanban.md) | Creación de solicitudes, tablero Kanban (drag & drop, columnas), asignación de resolutores, ruteo a sub-equipos, etiquetas, filtros |
| 02 | [Ciclo de vida del ticket](modulos/02-ciclo-de-vida-del-ticket.md) | Comentarios y menciones, adjuntos, criterios de aceptación, cierre con evidencia, feedback del cliente, calificación de resolución, auditoría/historial, timer |
| 03 | [Automatizaciones](modulos/03-automatizaciones.md) | Motor de reglas: asignación automática, prioridad automática, avisos al cumplirse condiciones sobre un ticket |
| 04 | [Notificaciones y Correo](modulos/04-notificaciones-y-correo.md) | Notificaciones in-app y push, plantillas y envío de correo (Microsoft Graph), logs de envío, anuncios globales |
| 05 | [Organización y Equipos](modulos/05-organizacion-y-equipos.md) | Departamentos, equipos de board, sub-equipos, supervisores, configuración de columnas por equipo, catálogo de etiquetas |
| 06 | [Usuarios y Autenticación](modulos/06-usuarios-y-autenticacion.md) | Login corporativo (Entra ID), migración MSAL → Supabase Auth, gestión de usuarios y roles, onboarding |
| 07 | [Sprints](modulos/07-sprints-y-estadisticas.md) | Períodos de trabajo, capacidad externa por equipo, arranque automático de sprint |
| 08 | [Plantillas de solicitudes](modulos/08-plantillas.md) | Definición de campos dinámicos, snapshot inmutable por ticket, renombrado de campos en background |
| 09 | [Exportaciones](modulos/09-exportaciones.md) | Exportación de tickets a Excel/CSV con filtros, historial, procesamiento por chunks |
| 10 | [Migración de datos](modulos/10-migracion-de-datos.md) | Herramienta ETL "PRISMA Migrations" (Excel → PRISMA), proyecto hermano fuera de `src/`/`supabase/` |
| 11 | [Integración SOLVI](modulos/11-integracion-solvi.md) | Sistema externo de mesa de ayuda/SLA integrado a PRISMA: tickets, comentarios y participantes propios |
| 12 | [Sistema y Soporte](modulos/12-sistema-y-soporte.md) | Reporte de bugs, calificación de satisfacción, jobs en background genéricos, actualización de versión de la PWA |
| 13 | [Dashboards y métricas de desempeño](modulos/13-dashboard.md) | Panel de estadísticas (`/stats`): cumplimiento, puntaje, flujo/salud; ranking de resolutores del panel admin |

## Convenciones de estos documentos

Cada documento de módulo sigue la misma estructura: **Resumen → Flujos de usuario → Arquitectura técnica (frontend / backend / tablas) → Reglas de negocio → Automatizaciones y efectos secundarios → Puntos frágiles → Referencia de acciones de la API**. La sección "Puntos frágiles" no es un backlog de bugs — es una lista de comportamientos verificados en el código que quien vaya a modificar ese módulo debería conocer antes de tocarlo.

Varios de esos puntos frágiles, por ser transversales, están además resumidos en [`ARQUITECTURA.md` §8](ARQUITECTURA.md#8-riesgos-arquitectónicos-y-puntos-frágiles-conocidos-fallos).
