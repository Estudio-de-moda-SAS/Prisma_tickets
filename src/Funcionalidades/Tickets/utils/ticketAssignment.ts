import type { UsuariosSP } from "../../../Models/Usuarios";
import type { GetAllOpts } from "../../../Models/Commons";
import type { UsuariosSPService } from "../../../services/Usuarios.service";
import { escapeOData,} from "../../../utils/Commons";

export async function increaseResolverCaseCount(Usuarios: UsuariosSPService, email?: string): Promise<void> {
  const safeEmail = email?.trim();
  if (!safeEmail) return;

  const opts: GetAllOpts = {
    filter: `fields/Correo eq '${escapeOData(safeEmail)}'`,
    top: 1,
  };

  const rows = await Usuarios.getAll(opts);
  const resolutorRow = rows.items?.[0];

  if (!resolutorRow?.Id) return;

  const prev = Number(resolutorRow.Numerodecasos ?? 0);
  await Usuarios.update(String(resolutorRow.Id), {
    Numerodecasos: prev + 1,
  });
}

export async function pickTecnicoConMenosCasos(Usuarios: UsuariosSPService): Promise<UsuariosSP | null> {

  // 1. Traer técnicos disponibles
  const resolutores: UsuariosSP[] = (await Usuarios.getAll({
    filter: "fields/Rol eq 'Tecnico' and fields/Disponible eq 'Disponible'",
  })).items;

  if (!resolutores.length) return null;

  // 2. Normalizar valores
  const clean = resolutores.map((r) => ({
    ...r,
    Numerodecasos: Number(r.Numerodecasos ?? 0),
  }));

  // 3. Encontrar mínimo
  const min = Math.min(...clean.map((r) => r.Numerodecasos));

  // 4. Filtrar los de menor carga
  const candidatos = clean.filter((r) => r.Numerodecasos === min);

  if (!candidatos.length) return null;

  // 5. Selección (random entre los mejores)
  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];

  return elegido;
}

export async function balanceCharge(Usuarios: UsuariosSPService, targetId: string, maxDiff = 3): Promise<{ ok: boolean }> {
  const resolutores: UsuariosSP[] = (await Usuarios.getAll({
    filter: "fields/Rol eq 'Tecnico' and fields/Disponible eq 'Disponible'",
  })).items;

  if (!resolutores.length) return { ok: false };

  const counts = resolutores.map((r) => Number(r.Numerodecasos ?? 0));
  const resolutor = await Usuarios.get(targetId);

  const min = Math.min(...counts);
  const respuesta = Number(resolutor.Numerodecasos ?? 0) + 1 - min < maxDiff;

  return { ok: respuesta };
}