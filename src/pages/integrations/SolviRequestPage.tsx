// src/pages/integrations/SolviRequestPage.tsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { config } from '@/config';
import { compressImage } from '@/lib/compressImage';
import { useIsMobile } from '@/components/hooks/useMediaQuery';
import { useSolviActionsTickets } from '@/features/requests/hooks/useSolviActions';
import { useSolviCategorias } from '@/features/requests/hooks/useSolviCategorias';
import { useSolviSubcategorias } from '@/features/requests/hooks/useSolviSubcategorias';
import { useSolviArticulos } from '@/features/requests/hooks/useSolviArticulos';
import { useSolviAns } from '@/features/requests/hooks/useSolviAns';
import {
  AdjuntosCard,
  CategoriaCascadeCard,
  DescripcionCard,
  SolicitudCard,
  SolicitudEnviadaScreen,
  SubmitBar,
  UsuarioErrorScreen,
} from '@/features/requests/components/SolviRequestPageComponents';

/* ============================================================
   SOLVI — Página de creación de solicitud (integración externa)
   ────────────────────────────────────────────────────────────
   SOLVI se opera en su propia aplicación, pero desde PRISMA se puede
   crear una solicitud. NO usa TBL_Requests: los tickets viven en
   TBL_Ticket_Solvi (esquema propio). Esta página solo dueña el estado y
   handleSubmit — las secciones visuales viven en SolviRequestPageComponents.
   ============================================================ */

const MAX_ATTACHMENTS = 5;
const FALLBACK_ACCENT = '#00b894';

export function SolviRequestPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { data: currentUser, isError: userError } = useCurrentUser();
  const { data: teams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const solviController = useSolviActionsTickets(currentUser);
  const { data: categories = [] } = useSolviCategorias();

  // Equipo SOLVI por su clave de integración: robusto venga de redirect,
  // sidebar o URL directa. De ahí sale el color definido al crear el kanban.
  const solviTeam = teams.find((t) => t.Board_Team_Integration_Key === 'solvi') ?? null;
  const ACCENT = solviTeam?.Board_Team_Color ?? FALLBACK_ACCENT;

  const [titulo,       setTitulo]       = useState('');
  const [descripcion,  setDescripcion]  = useState('');
  // Categoría/subcategoría/artículo en cascada: cada select guarda el Id de
  // SharePoint del item elegido (no el Title), porque las listas hijas
  // filtran por Id_Categoria / Id_Subcategoria, no por nombre.
  const [categoriaId,    setCategoriaId]    = useState('');
  const [subcategoriaId, setSubcategoriaId] = useState('');
  const [articuloId,     setArticuloId]     = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [dragOver,     setDragOver]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [isPending,    setIsPending]    = useState(false);
  const [submitted,       setSubmitted]       = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: subcategories = [], isLoading: subcategoriesLoading } = useSolviSubcategorias(categoriaId || null);
  const { data: articulos = [],     isLoading: articulosLoading }     = useSolviArticulos(subcategoriaId || null);
  // Si ya cargaron los artículos de la subcategoría y no hay ninguno, el ANS
  // se busca por categoría + subcategoría solamente (ver useSolviAns).
  const subcategoriaSinArticulos = !!subcategoriaId && !articulosLoading && articulos.length === 0;
  const { data: ansInfo = null, isLoading: ansLoading } = useSolviAns(
    categoriaId || null,
    subcategoriaId || null,
    articuloId || null,
    subcategoriaSinArticulos,
  );

  const categoriaTitle    = categories.find((c) => c.Id === categoriaId)?.Title ?? '';
  const subcategoriaTitle = subcategories.find((s) => s.Id === subcategoriaId)?.Title ?? '';
  const articuloTitle     = articulos.find((a) => a.Id === articuloId)?.Title ?? '';

  const dataLoading = !currentUser;
  // Mientras cualquiera de estas siga en vuelo, subcategories/articulos/ansInfo
  // pueden estar en su valor por defecto (vacío) sin que eso signifique que la
  // categoría/subcategoría elegida realmente no tiene opciones — hay que
  // esperar a que resuelvan antes de validar o de guardar el ticket.
  const treeLoading = subcategoriesLoading || articulosLoading || ansLoading;

  // Errores en vivo (solo tras el primer intento) → se limpian solos al corregir.
  // Subcategoría/artículo solo son obligatorios cuando la categoría/subcategoría
  // elegida efectivamente tiene opciones para ese nivel (si no tiene, no se bloquea).
  const titleError        = submitAttempted && !titulo.trim();
  const categoriaError    = submitAttempted && !categoriaId;
  const subcategoriaError = submitAttempted && subcategories.length > 0 && !subcategoriaId;
  const articuloError     = submitAttempted && articulos.length > 0 && !articuloId;

  function addFiles(incoming: File[]) {
    const slots = MAX_ATTACHMENTS - pendingFiles.length;
    const toAdd = incoming.slice(0, slots);
    if (toAdd.length > 0) setPendingFiles([...pendingFiles, ...toAdd]);
  }
  function removeFile(idx: number) { setPendingFiles(pendingFiles.filter((_, i) => i !== idx)); }

  function handleCategoriaChange(id: string) {
    setCategoriaId(id);
    setSubcategoriaId('');
    setArticuloId('');
    setError(null);
  }

  function handleSubcategoriaChange(id: string) {
    setSubcategoriaId(id);
    setArticuloId('');
    setError(null);
  }

  function handleArticuloChange(id: string) {
    setArticuloId(id);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true); // a partir de acá los campos muestran su error en vivo

    if (!currentUser) { setError('Cargando datos del usuario...'); return; }

    // Evita crear el ticket a mitad de camino: si todavía están resolviendo
    // subcategorías/artículos/ANS, esperamos en vez de validar contra listas
    // que todavía pueden estar vacías por no haber cargado.
    if (treeLoading) {
      setError('Esperá a que terminen de cargar las opciones antes de enviar.');
      return;
    }

    const titleMissing        = !titulo.trim();
    const categoriaMissing    = !categoriaId;
    const subcategoriaMissing = subcategories.length > 0 && !subcategoriaId;
    const articuloMissing     = articulos.length > 0 && !articuloId;

    if (titleMissing || categoriaMissing || subcategoriaMissing || articuloMissing) {
      const firstKey = titleMissing ? 'titulo' : 'categoria';
      const total    = [titleMissing, categoriaMissing, subcategoriaMissing, articuloMissing].filter(Boolean).length;
      setError(
        total === 1
          ? 'Falta 1 campo obligatorio. Revisá lo señalado en rojo.'
          : `Faltan ${total} campos obligatorios. Revisá lo señalado en rojo.`,
      );
      requestAnimationFrame(() => {
        document.querySelector(`[data-vfield="${firstKey}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      const created = await solviController.saveTicket(
        titulo,
        descripcion,
        pendingFiles,
        categoriaTitle,
        subcategoriaTitle || undefined,
        articuloTitle || undefined,
        ansInfo?.horas,
        ansInfo?.nombre,
      );

      if (!created) {
        alert('Algo ha salido mal');
        throw Error('Algo ha salido mal');
      }

      void compressImage;
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la solicitud.');
    } finally {
      setIsPending(false);
    }
  }

  if (userError) {
    return <UsuarioErrorScreen onVolver={() => navigate('/home')} />;
  }

  if (submitted) {
    return (
      <SolicitudEnviadaScreen
        accent={ACCENT}
        isMobile={isMobile}
        onCrearOtra={() => { setTitulo(''); setDescripcion(''); setPendingFiles([]); setSubmitted(false); setError(null); }}
        onVolver={() => navigate('/home')}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: isMobile ? '0 14px 24px' : '0 50px 32px', width: '100%', margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>🔌</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, padding: '3px 10px', borderRadius: 3 }}>SOLVI</span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 8 }}>Nueva solicitud SOLVI</h2>
        <p style={{ fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>Completá los datos básicos. La gestión posterior se realiza en la plataforma de SOLVI.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SolicitudCard
          accent={ACCENT}
          titulo={titulo}
          onTituloChange={(v) => { setTitulo(v); setError(null); }}
          titleError={titleError}
          focusedField={focusedField}
          onFocusField={setFocusedField}
          currentUser={currentUser}
        />

        <CategoriaCascadeCard
          accent={ACCENT}
          focusedField={focusedField}
          onFocusField={setFocusedField}
          categories={categories}
          categoriaId={categoriaId}
          onCategoriaChange={handleCategoriaChange}
          categoriaError={categoriaError}
          subcategories={subcategories}
          subcategoriesLoading={subcategoriesLoading}
          subcategoriaId={subcategoriaId}
          onSubcategoriaChange={handleSubcategoriaChange}
          subcategoriaError={subcategoriaError}
          articulos={articulos}
          articulosLoading={articulosLoading}
          articuloId={articuloId}
          onArticuloChange={handleArticuloChange}
          articuloError={articuloError}
          ansInfo={ansInfo}
          ansLoading={ansLoading}
        />

        <DescripcionCard accent={ACCENT} descripcion={descripcion} onDescripcionChange={setDescripcion} />

        <AdjuntosCard
          accent={ACCENT}
          pendingFiles={pendingFiles}
          maxAttachments={MAX_ATTACHMENTS}
          dragOver={dragOver}
          onDragOverChange={setDragOver}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          fileInputRef={fileInputRef}
        />

        {error && <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)', color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

        <SubmitBar
          accent={ACCENT}
          isMobile={isMobile}
          isPending={isPending}
          dataLoading={dataLoading || treeLoading}
          onBack={() => navigate('/new')}
        />
      </div>
    </form>
  );
}
