// src/config/mapping.ts
//
// MANIFIESTO DE MAPEO (la capa "qué columna → qué destino").
// El motor lee por NOMBRE de encabezado, no por posición, así que
// el orden de las columnas en el Excel no importa.
//
// Para adaptar otro Excel con columnas distintas: editar SOLO este
// archivo, nunca el motor.

import { TARGET_COLUMN_ID } from './runConfig.ts';

/* ────────────────────────────────────────────────────────────
   Encabezados exactos del Excel que SÍ se usan.
   Si un Excel nombra distinto una columna, se cambia aquí.
   ──────────────────────────────────────────────────────────── */
export const COL = {
  titulo:            'Actividad',
  descripcion:       'Descripción de la solicitud',
  asignada:          'Asignada',
  status:            'Status',
  prioridad:         'Prioridad',
  equipoSolicitante: 'Equipo solicitante',
  sprint:            'Sprint',
  epica:             'Epica',
  tiempoEstimado:    'Tiempo estimado',
  tiempoReal:        'Tiempo real consumido',
  notas:             'Notas',
  creada:            'Actividad creada',
  cerrada:           'Actividad cerrada',
  confidencial:      'Información sensible o confidencial',
} as const;

/* ────────────────────────────────────────────────────────────
   Status → columna del Kanban.
   HOY: todo cae en el default (Historial). La estructura queda
   lista para enrutar por status real: agregar entradas como
   'En curso': <Board_Column_ID>, etc. (clave normalizada).
   ──────────────────────────────────────────────────────────── */
export const STATUS_TO_COLUMN: Record<string, number> = {
  // 'historial done': TARGET_COLUMN_ID,   // ejemplo; hoy no hace falta
};

/** Columna usada cuando el status no está en el mapa de arriba. */
export const DEFAULT_COLUMN_ID = TARGET_COLUMN_ID;

/* ────────────────────────────────────────────────────────────
   Columnas IGNORADAS a propósito (referencia/documentación).
   No se procesan; se listan para que quede explícito el porqué.
   ──────────────────────────────────────────────────────────── */
export const DISCARDED_COLUMNS = [
  'Adjunto',                  // los adjuntos quedan vacíos en Prisma
  'Persona asignada',         // viene vacía; el resolutor es "Asignada"
  'Puntaje',                  // el Score se deriva de Prioridad, no de aquí
  'Periodicidad',
  'Que se resolverá',
  'Fecha de entrega',         // viene vacía
  'Proveedor o servicio externo que ayude a la actividad',
  'Describa el proveedor o servicio externo que ayuda a la actividad',
  'Frecuencia de ejecución',
  'Puntaje planeado',
  'Puntaje realizado',
  'Resumen',
] as const;