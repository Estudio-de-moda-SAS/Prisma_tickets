import type { UsuariosSP, UsuariosSPService } from './TecnicosSharepointSolvi.service';

// Asigna al técnico disponible con menos casos activos; en caso de empate, elige uno al azar entre los empatados.
export async function pickTecnicoConMenosCasos(usuarios: UsuariosSPService): Promise<UsuariosSP | null> {
  const tecnicos = await usuarios.getAll({
    filter: "fields/Rol eq 'Tecnico' and fields/Disponible eq 'Disponible'",
    top: 50,
  });

  if (!tecnicos || tecnicos.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let candidatos: UsuariosSP[] = [];

  for (const t of tecnicos) {
    const carga = Number(t.Numerodecasos ?? 0);
    if (carga < min) {
      min = carga;
      candidatos = [t];
    } else if (carga === min) {
      candidatos.push(t);
    }
  }

  return candidatos[Math.floor(Math.random() * candidatos.length)] ?? null;
}
