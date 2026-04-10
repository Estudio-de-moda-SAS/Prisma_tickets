import type { GraphRest } from "../graph/GraphRest";
import type { Archivo } from "../Models/Attachments";


type GraphPaged<T> = {
  value: T[];
  "@odata.nextLink"?: string;
};

function toRelativePath(nextLink: string): string {
  const u = new URL(nextLink);

  // u.pathname normalmente es "/v1.0/drives/..."
  // tu wrapper ya tiene base ".../v1.0/", así que quitamos ese prefijo
  const p = u.pathname.replace(/^\/v1\.0/i, "");

  return p + u.search; // queda "/drives/...?$skiptoken=..."
}

function mapToArchivo(item: any): Archivo {
  const parentPath = item.parentReference?.path ?? "";
  const fullPath = parentPath
    ? `${parentPath}/${item.name}`
    : item.name; 

  return {
    id: item.id,
    name: item.name,
    webUrl: item.webUrl,
    isFolder: !!item.folder,
    size: item.size,
    lastModified: item.lastModifiedDateTime,
    childCount: item.folder?.childCount ?? undefined,
    created: item.createdDateTime,
    path: fullPath
  };
}

class BibliotecaBaseService {
  protected graph: GraphRest;
  protected hostname: string;
  protected sitePath: string;
  protected libraryName: string;

  protected siteId?: string;
  protected driveId?: string;

  constructor(
    graph: GraphRest,
    hostname: string,
    sitePath: string,
    libraryName: string
  ) {
    this.graph = graph;
    this.hostname = hostname;
    this.sitePath = sitePath.startsWith("/") ? sitePath : `/${sitePath}`;
    this.libraryName = libraryName;
  }

  private loadCache() {
    try {
      const k = `sp-drive:${this.hostname}${this.sitePath}:${this.libraryName}`;
      const raw = localStorage.getItem(k);
      if (raw) {
        const { siteId, driveId } = JSON.parse(raw);
        this.siteId = siteId || this.siteId;
        this.driveId = driveId || this.driveId;
      }
    } catch {}
  }

  private saveCache() {
    try {
      const k = `sp-drive:${this.hostname}${this.sitePath}:${this.libraryName}`;
      localStorage.setItem(
        k,
        JSON.stringify({ siteId: this.siteId, driveId: this.driveId })
      );
    } catch {}
  }

  protected async ensureIds() {
    if (!this.siteId || !this.driveId) this.loadCache();

    // 1) siteId
    if (!this.siteId) {
      const site = await this.graph.get<any>(
        `/sites/${this.hostname}:${this.sitePath}`
      );
      this.siteId = site?.id;
      if (!this.siteId) throw new Error("No se pudo resolver siteId");
      this.saveCache();
    }

    // 2) driveId (biblioteca)
    if (!this.driveId) {
      const drivesRes = await this.graph.get<any>(
        `/sites/${this.siteId}/drives`
      );
      const drive = (drivesRes?.value ?? []).find(
        (d: any) => d.name === this.libraryName
      );
      if (!drive?.id) {
        throw new Error(`Biblioteca no encontrada: ${this.libraryName}`);
      }
      this.driveId = drive.id;
      this.saveCache();
    }
  }

  private encodePath(p: string) {
    const clean = (p ?? "").replace(/^\/|\/$/g, "");
    if (!clean) return "";
    return clean
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
  }

  // =========================
  // LISTAR / PAGINAR
  // =========================

  // Listar archivos de una carpeta (por ruta)
  async getFilesInFolder(folderPath: string): Promise<Archivo[]> {
    await this.ensureIds();

    const encodedPath = this.encodePath(folderPath);
    let url =
      encodedPath.length > 0
        ? `/drives/${this.driveId}/root:/${encodedPath}:/children?$top=200`
        : `/drives/${this.driveId}/root/children?$top=200`;

    const all: any[] = [];

    while (url) {
      const res = await this.graph.get<GraphPaged<any>>(url);
      all.push(...(res.value ?? []));
      const next = res["@odata.nextLink"];
      url = next ? toRelativePath(next) : "";
    }

    return all.map(mapToArchivo);
  }

  // Listar archivos de una carpeta (por ID) - con paginación
  async getFilesByFolderId(folderId: string): Promise<Archivo[]> {
    await this.ensureIds();

    let url = `/drives/${this.driveId}/items/${folderId}/children?$top=200`;
    const all: any[] = [];

    while (url) {
      const res = await this.graph.get<GraphPaged<any>>(url);
      all.push(...(res.value ?? []));
      const next = res["@odata.nextLink"];
      url = next ? toRelativePath(next) : "";
    }

    return all.map(mapToArchivo);
  }

  // Buscar carpeta por número de documento dentro de "Colaboradores Activos"
  // (OJO: ahora pagina también, por si hay miles de carpetas)
  async findFolderByDocNumber(docNumber: string): Promise<Archivo | null> {
    await this.ensureIds();

    const canon = (s: string) =>
      (s ?? "")
        .toString()
        .replace(/\u00a0/g, " ") // NBSP -> espacio normal
        .replace(/\s+/g, " ")
        .trim();

    const baseFolder = "Colaboradores Activos";
    const encodedBase = this.encodePath(baseFolder);

    let url = `/drives/${this.driveId}/root:/${encodedBase}:/children?$top=200`;

    const doc = canon(docNumber);
    const prefix = `${doc} -`;

    while (url) {
      const res = await this.graph.get<GraphPaged<any>>(url);
      const items: any[] = res.value ?? [];

      const folder = items.find((item) => {
        if (!item?.folder) return false;
        const name = canon(item?.name ?? "");
        return name.startsWith(prefix);
      });

      if (folder) {

        const parentPath = folder.parentReference?.path ?? "";
        const fullPath = parentPath
          ? `${parentPath}/${folder.name}`
          : folder.name; 

        return {
          id: folder.id,
          name: folder.name,
          webUrl: folder.webUrl,
          isFolder: !!folder.folder,
          size: folder.size,
          lastModified: folder.lastModifiedDateTime,
          childCount: folder.folder?.childCount ?? undefined,
          created: folder.createdDateTime,
          path: fullPath
        };
      }

      const next = res["@odata.nextLink"];
      url = next ? toRelativePath(next) : "";
    }

    return null;
  }

  async uploadFileByFolderId(folderId: string, file: File): Promise<Archivo> {
    await this.ensureIds();

    if (!folderId) throw new Error("folderId es requerido");
    if (!file?.name) throw new Error("Archivo inválido");

    // IMPORTANTE:
    // - Para el nombre del archivo usa encodeURIComponent (no encodeURI),
    //   porque encodeURI NO escapa bien caracteres como # ? % etc.
    const fileName = file.name;
    const encodedName = encodeURIComponent(fileName);

    const driveItem = await this.graph.putBinary<any>(
      `/drives/${this.driveId}/items/${folderId}:/${encodedName}:/content`,
      file,
      file.type || "application/octet-stream"
    );

    const parentPath = driveItem.parentReference?.path ?? "";
    const fullPath = parentPath
      ? `${parentPath}/${driveItem.name}`
      : driveItem.name; 
    
    return {
      id: driveItem.id,
      name: driveItem.name,
      webUrl: driveItem.webUrl,
      isFolder: !!driveItem.folder,
      size: driveItem.size,
      lastModified: driveItem.lastModifiedDateTime,
      childCount: driveItem.folder?.childCount ?? undefined,
      created: driveItem.createdDateTime,
      path: fullPath
    };
}

  // =========================
  // UPLOAD / RENOMBRE / MOVER
  // =========================

  async uploadFile(folderPath: string, file: File, name?: string): Promise<Archivo> {
    await this.ensureIds();
    
    const ext = file.name.split(".")[1]
    const cleanFolder = (folderPath ?? "").replace(/^\/|\/$/g, "");
    const fileName = name ? `${name}.${ext}` : file.name;

    const serverPath = cleanFolder.length > 0 ? `${cleanFolder}/${fileName}` : fileName;

    const driveItem = await this.graph.putBinary<any>(
      `/drives/${this.driveId}/root:/${encodeURI(serverPath)}:/content`,
      file,
      file.type || "application/octet-stream"
    );

    const parentPath = driveItem.parentReference?.path ?? "";
    const fullPath = parentPath
      ? `${parentPath}/${driveItem.name}`
      : driveItem.name; 

    return {
      id: driveItem.id,
      name: driveItem.name,
      webUrl: driveItem.webUrl,
      isFolder: !!driveItem.folder,
      size: driveItem.size,
      lastModified: driveItem.lastModifiedDateTime,
      childCount: driveItem.folder?.childCount ?? undefined,
      created: driveItem.createdDateTime,
      path: fullPath
    };
  }

  async renameArchivo(archivo: Archivo, nuevoNombreSinExtension: string): Promise<Archivo> {
    await this.ensureIds();

    let ext = "";
    if (!archivo.isFolder) {
      const dot = archivo.name.lastIndexOf(".");
      if (dot > 0) ext = archivo.name.slice(dot);
    }

    const newName = `${nuevoNombreSinExtension}${ext}`;

    const item = await this.graph.patch<any>(
      `/drives/${this.driveId}/items/${archivo.id}`,
      { name: newName }
    );

    const parentPath = item.parentReference?.path ?? "";
    const fullPath = parentPath
      ? `${parentPath}/${item.name}`
      : item.name; 

    return {
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      isFolder: !!item.folder,
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      childCount: item.folder?.childCount ?? undefined,
      created: item.createdDateTime,
      path: fullPath
    };
  }

  async moveFolderByPath(
    sourceFolderPath: string,
    destParentFolderPath: string,
    opts?: { newName?: string }
  ): Promise<Archivo> {
    await this.ensureIds();

    const enc = (p: string) =>
      (p ?? "")
        .replace(/^\/|\/$/g, "")
        .split("/")
        .map(encodeURIComponent)
        .join("/");

    const srcPath = enc(sourceFolderPath);
    const dstPath = enc(destParentFolderPath);

    const src = await this.graph.get<any>(`/drives/${this.driveId}/root:/${srcPath}`);
    if (!src?.id || !src?.folder) {
      throw new Error("La ruta origen no es una carpeta válida o no existe.");
    }

    const dst = await this.graph.get<any>(`/drives/${this.driveId}/root:/${dstPath}`);
    if (!dst?.id || !dst?.folder) {
      throw new Error("La ruta destino no es una carpeta válida o no existe.");
    }

    const body: any = { parentReference: { id: dst.id } };
    const newName = opts?.newName?.trim();
    if (newName) body.name = newName;

    const moved = await this.graph.patch<any>(
      `/drives/${this.driveId}/items/${src.id}`,
      body
    );

    const parentPath = moved.parentReference?.path ?? "";
    const fullPath = parentPath
      ? `${parentPath}/${moved.name}`
      : moved.name; 

    return {
      id: moved.id,
      name: moved.name,
      webUrl: moved.webUrl,
      isFolder: !!moved.folder,
      size: moved.size,
      lastModified: moved.lastModifiedDateTime,
      childCount: moved.folder?.childCount ?? undefined,
      created: moved.createdDateTime,
      path: fullPath
    };
  }

  async deleteArchivoById(itemId: string): Promise<void> {
    await this.ensureIds();

    if (!itemId) {
      throw new Error("itemId es requerido");
    }

    await this.graph.delete(`/drives/${this.driveId}/items/${itemId}`);
  }

  async getFileById(itemId: string): Promise<Archivo> {
    await this.ensureIds();

    if (!itemId) {
      throw new Error("itemId es requerido");
    }

    const item = await this.graph.get<any>(
      `/drives/${this.driveId}/items/${itemId}`
    );

    const parentPath = item.parentReference?.path ?? "";
    const fullPath = parentPath
      ? `${parentPath}/${item.name}`
      : item.name;

    return {
      id: item.id,
      name: item.name,
      webUrl: item.webUrl,
      isFolder: !!item.folder,
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      childCount: item.folder?.childCount ?? undefined,
      created: item.createdDateTime,
      path: fullPath,
    };
  }

}

// =========================
// Subclases por biblioteca
// =========================

export class TicketsBibliotecaAttachmentsService extends BibliotecaBaseService {
  constructor(graph: GraphRest, hostname: string, sitePath: string, name: string) {
    super(graph, hostname, sitePath, name);
  }
}
