import type {
  DropdownOption,
  PriorityInfoConfig,
  TicketFormConfig,
} from "./ticketFormTypes";

export const storeOptions: DropdownOption[] = [
  { label: "Pilatos", value: "pilatos", color: "yellow" },
  { label: "Chopper", value: "chopper", color: "pink" },
  { label: "Girbaud", value: "girbaud", color: "blue" },
  { label: "Replay", value: "replay", color: "green" },
  { label: "Diesel", value: "diesel", color: "cyan" },
  { label: "Superdry", value: "superdry", color: "orange" },
  { label: "Kipling", value: "kipling", color: "purple" },
];
export const developmentUxRequestTeamOptions: DropdownOption[] = [
  { label: "Pilatos y Chopper Ecom", value: "pilatos-chopper-ecom" },
  { label: "Girbaud y Replay Ecom", value: "girbaud-replay-ecom" },
  {
    label: "Kipling, Diesel y Superdry Ecom",
    value: "kipling-diesel-superdry-ecom",
  },
];
export const generalRequestTeamOptions: DropdownOption[] = [
  { label: "Abastecimiento", value: "abastecimiento" },
  { label: "Capital Humano", value: "capital-humano" },
  { label: "Compras y planeación de demanda", value: "compras-planeacion" },
  { label: "Contabilidad", value: "contabilidad" },
  { label: "Control interno", value: "control-interno" },
  { label: "CRM", value: "crm" },
  { label: "Ecommerce", value: "ecommerce" },
  { label: "Financiera", value: "financiera" },
  { label: "Inteligencia comercial", value: "inteligencia-comercial" },
  { label: "Jurídico", value: "juridico" },
  { label: "Proyectos", value: "proyectos" },
  { label: "Retail", value: "retail" },
  { label: "SAC", value: "sac" },
  { label: "TI", value: "ti" },
  { label: "Wholesale", value: "wholesale" },
];

export const dataScienceRequestTeamOptions: DropdownOption[] = [
  { label: "Abastecimiento", value: "abastecimiento" },
  { label: "Capital Humano", value: "capital-humano" },
  { label: "Compras y planeación de demanda", value: "compras-planeacion" },
  { label: "Contabilidad", value: "contabilidad" },
  { label: "Control interno", value: "control-interno" },
  { label: "CRM", value: "crm" },
  { label: "Ecommerce", value: "ecommerce" },
  { label: "Financiera", value: "financiera" },
  { label: "Inteligencia comercial", value: "inteligencia-comercial" },
  { label: "Jurídica", value: "juridica" },
  { label: "Proyectos", value: "proyectos" },
  { label: "Retail", value: "retail" },
  { label: "SAC", value: "sac" },
  { label: "TI", value: "ti" },
  { label: "Wholesale", value: "wholesale" },

  {
    label: "Gerencia Pilatos - Chopper - Broken",
    value: "gerencia-pilatos-chopper-broken",
  },
  {
    label: "Gerencia Girbaud",
    value: "gerencia-girbaud",
  },
  {
    label: "Gerencia - Superdry - Kipling - Diesel",
    value: "gerencia-superdry-kipling-diesel",
  },
];

export const crmRequestTeamOptions: DropdownOption[] = [
  { label: "Pilatos y Chopper Ecom", value: "pilatos-chopper-ecom" },
  { label: "Girbaud y Replay Ecom", value: "girbaud-replay-ecom" },
  { label: "Kipling, Diesel y Superdry Ecom", value: "kipling-diesel-superdry-ecom" },
  { label: "Pilatos y Chopper Mercadeo", value: "pilatos-chopper-mercadeo" },
  { label: "Girbaud y Replay Mercadeo", value: "girbaud-replay-mercadeo" },
  { label: "Kipling, Diesel y Superdry Mercadeo", value: "kipling-diesel-superdry-mercadeo" },
];

export const priorityOptions: DropdownOption[] = [
  { label: "Urgente", value: "urgente", color: "red" },
  { label: "Alto", value: "alto", color: "orange" },
  { label: "Medio", value: "medio", color: "yellow" },
  { label: "Bajo", value: "bajo", color: "green" },
];

export const dataFormatOptions: DropdownOption[] = [
  { label: "Tablero de POWER BI", value: "power-bi" },
  { label: "Excel con actualización automática", value: "excel-automatico" },
  { label: "Ejecutable en ERP", value: "erp" },
];

const standardPriorityInfo: PriorityInfoConfig = {
  title: "Elige la prioridad así: Por favor ser muy honesto en este campo.",
  items: [
    {
      label: "Urgente",
      color: "red",
      description:
        "Procesos críticos que detienen total o parcialmente la operación de la compañía.",
    },
    {
      label: "Alto",
      color: "orange",
      description:
        "Impacta de forma importante el trabajo, pero no detiene completamente la operación. (De alta relevancia a la compañía)",
    },
    {
      label: "Medio",
      color: "yellow",
      description:
        "Necesario para el funcionamiento regular pero no afecta actividades críticas. Puede resolverse en un tiempo estándar (Automatización que libere horas hombre en procesos operativos, etc.)",
    },
    {
      label: "Bajo",
      color: "green",
      description:
        "Tareas de conveniencia o solicitudes que no afectan el trabajo diario. No tienen urgencia ni impacto operacional (Mejora o cambio de proceso actual que requiera ajustes mínimos para su funcionamiento o soporte, etc.)",
    },
  ],
};

const developmentUxPriorityInfo: PriorityInfoConfig = {
  title: "Elige la prioridad así: Por favor ser muy honesto en este campo.",
  items: [
    {
      label: "Urgente",
      color: "red",
      description:
        "Procesos críticos que detienen total o parcialmente la operación de la compañía (Vtex caído)",
    },
    {
      label: "Alto",
      color: "orange",
      description:
        "Impacta de forma importante el trabajo, pero no detiene completamente la operación. (De alta relevancia a la compañía)",
    },
    {
      label: "Medio",
      color: "yellow",
      description:
        "Necesario para el funcionamiento regular pero no afecta actividades críticas. Puede resolverse en un tiempo estándar (Automatización que libere horas hombre en procesos operativos, etc.)",
    },
    {
      label: "Bajo",
      color: "green",
      description:
        "Tareas de conveniencia o solicitudes que no afectan el trabajo diario. No tienen urgencia ni impacto operacional (Mejora o cambio de proceso actual que requiera ajustes mínimos para su funcionamiento o soporte, etc.)",
    },
  ],
};
const crmPriorityInfo: PriorityInfoConfig = {
  title: "Elige la prioridad así: Por favor ser muy honesto en este campo.",
  items: [
    {
      label: "Urgente",
      color: "red",
      description:
        "Actividades o estrategias críticas que permiten cumplir indicadores o procesos comerciales de la compañía (PAC de ultima hora, etc)",
    },
    {
      label: "Alto",
      color: "orange",
      description:
        "Actividades o estrategias que requieren ser trabajadas bajo una programación y flujo de trabajo más detallado y no bloquean activación comercial (Proyecto incubadora, Proyecto fidelización, Retos, etc)",
    },
    {
      label: "Medio",
      color: "yellow",
      description:
        "Necesario para el funcionamiento regular pero no afecta actividades críticas. Puede ser programado el desarrollo en un tiempo estimado (Solicitudes de bases de datos, Actualización de aplicaciones, Reportes, Documentaciones, etc.)",
    },
    {
      label: "Bajo",
      color: "green",
      description:
        "Actividades que no afectan el trabajo diario, pero ayuda a entender y crear estrategias (Mejoras a reportes y/o aplicativos que ya funcionan etc.)",
    },
  ],
};

const defaultConfidentialInfo = {
  message:
    "Recuerda que para subir este ticket que contiene información confidencial, debes validar primero el manejo de estos datos con el área de jurídica.",
  highlightedText: "información confidencial",
};

export const developmentUxFormConfig: TicketFormConfig = {
  id: "development-ux",
  title: "Nueva solicitud equipo Desarrollo + UX",
  priorityInfo: developmentUxPriorityInfo,
  confidentialInfo: defaultConfidentialInfo,
  fields: [
    {
      id: "requestName",
      type: "text",
      label: "Nombre de la solicitud",
      placeholder: "Ej: Nueva landing estrategia 2 por 1",
    },
    {
      id: "description",
      type: "textarea",
      label: "Descripción",
      placeholder:
        "Cuéntanos todo acerca de esta tarea con el mayor detalle para comprender y ejecutar la solicitud",
    },
    {
      id: "isEcommerce",
      type: "radio",
      label: "¿Haces parte del equipo Ecommerce?",
      options: [
        { label: "No", value: "no" },
        { label: "Sí", value: "yes" },
      ],
    },
    {
      id: "store",
      type: "select",
      label: "Tienda",
      options: storeOptions,
    },
    {
      id: "requestTeam",
      type: "select",
      label: "Equipo solicitante",
      options: developmentUxRequestTeamOptions,
      variant: "lines",
    },
    {
      id: "priority",
      type: "select",
      label: "Prioridad",
      options: priorityOptions,
    },
    {
      id: "confidential",
      type: "radio",
      label: "¿Contiene información confidencial?",
      options: [
        { label: "No", value: "no" },
        { label: "Sí", value: "yes" },
      ],
    },
    {
      id: "attachments",
      type: "upload",
      label: "Soporte, documentación y/o anexos",
    },
  ],
};

export const crmFormConfig: TicketFormConfig = {
  id: "crm",
  title: "Nueva solicitud equipo CRM",
  priorityInfo: crmPriorityInfo,
  confidentialInfo: defaultConfidentialInfo,
  fields: [
    {
      id: "requestName",
      type: "text",
      label: "Nombre de la solicitud",
      placeholder:
        "Base de datos de frecuencia de diesel online – Conectar un código QR a una encuesta ...",
    },
    {
      id: "description",
      type: "textarea",
      label: "Descripción",
      placeholder:
        "Cuéntanos todo acerca de esta tarea con el mayor detalle para comprender y ejecutar la solicitud",
    },
    {
      id: "store",
      type: "select",
      label: "Tienda",
      options: storeOptions,
    },
    {
      id: "requestTeam",
      type: "select",
      label: "Equipo solicitante",
      options: crmRequestTeamOptions,
      variant: "lines",
    },
    {
      id: "priority",
      type: "select",
      label: "Prioridad",
      options: priorityOptions,
    },
    {
      id: "confidential",
      type: "radio",
      label: "¿Contiene información confidencial?",
      options: [
        { label: "No", value: "no" },
        { label: "Sí", value: "yes" },
      ],
    },
    {
      id: "attachments",
      type: "upload",
      label: "Soporte, documentación y/o anexos",
    },
  ],
};

export const systemsFormConfig: TicketFormConfig = {
  id: "systems",
  title: "Nueva solicitud equipo Sistemas de Información",
  priorityInfo: standardPriorityInfo,
  confidentialInfo: defaultConfidentialInfo,
  fields: [
    {
      id: "requestName",
      type: "text",
      label: "Nombre de la solicitud",
      placeholder: "Ej: Revisión, servidores XYZ...",
    },
    {
      id: "description",
      type: "textarea",
      label: "Descripción",
      placeholder:
        "Cuéntanos todo acerca de esta tarea con el mayor detalle para comprender y ejecutar la solicitud",
    },
    {
      id: "requestTeam",
      type: "select",
      label: "Equipo solicitante",
      options: generalRequestTeamOptions,
      variant: "lines",
    },
    {
      id: "priority",
      type: "select",
      label: "Prioridad",
      options: priorityOptions,
    },
    {
      id: "confidential",
      type: "radio",
      label: "¿Contiene información confidencial?",
      options: [
        { label: "No", value: "no" },
        { label: "Sí", value: "yes" },
      ],
    },
    {
      id: "attachments",
      type: "upload",
      label: "Soporte, documentación y/o anexos",
    },
  ],
};

export const dataScienceFormConfig: TicketFormConfig = {
  id: "data-science",
  title: "Nueva solicitud equipo Ciencia de Datos",
  priorityInfo: standardPriorityInfo,
  confidentialInfo: defaultConfidentialInfo,
  fields: [
    {
      id: "requestName",
      type: "text",
      label: "Nombre de la solicitud",
      placeholder: "Ej: Nuevo tablero ventas",
    },
    {
      id: "description",
      type: "textarea",
      label: "Descripción",
      placeholder:
        "Cuéntanos todo acerca de esta tarea con el mayor detalle para comprender y ejecutar la solicitud",
    },
    {
      id: "requestTeam",
      type: "select",
      label: "Equipo solicitante",
      options: dataScienceRequestTeamOptions,
      variant: "lines",
    },
    {
      id: "informationSource",
      type: "text",
      label: "¿Desde dónde sale la información necesaria?",
      placeholder:
        "Agrega aquí el link, ruta, API, o el lugar donde se encuentra la información que necesitaremos.",
    },
    {
      id: "requiredFields",
      type: "textarea",
      label: "¿Cuáles campos debería tener?",
      placeholder:
        "Cuéntanos qué información debe incluir (ej: talla, marca, tienda...)",
    },
    {
      id: "requiredFormat",
      type: "select",
      label: "¿En qué formato necesitas la información?",
      options: dataFormatOptions,
      variant: "lines",
    },
    {
      id: "priority",
      type: "select",
      label: "Prioridad",
      options: priorityOptions,
    },
    {
      id: "confidential",
      type: "radio",
      label: "¿Contiene información confidencial?",
      options: [
        { label: "No", value: "no" },
        { label: "Sí", value: "yes" },
      ],
    },
    {
      id: "attachments",
      type: "upload",
      label: "Soporte, documentación y/o anexos",
    },
  ],
};