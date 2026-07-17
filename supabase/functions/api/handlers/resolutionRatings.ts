import type { ActionHandler } from '../shared/types.ts';

export const resolutionRatingHandlers: Record<string, ActionHandler> = {
  fetchResolutionRatings: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Resolution_Ratings')
      .select(`
        Rating_ID, Request_ID, Solution_Score, Attention_Score, Comment, Created_At,
        rater:TBL_Users!Rated_By ( User_ID, User_Name ),
        request:TBL_Requests!Request_ID ( Request_Title ),
        resolvers:TBL_Resolution_Rating_Resolvers (
          resolver:TBL_Users!Resolver_User_ID ( User_ID, User_Name )
        )
      `)
      .order('Created_At', { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((r: any) => ({
      ratingId:       r.Rating_ID,
      requestId:      r.Request_ID,
      requestTitle:   r.request?.Request_Title ?? null,
      solutionScore:  r.Solution_Score,
      attentionScore: r.Attention_Score,
      comment:        r.Comment,
      createdAt:      r.Created_At,
      rater:          r.rater ? { userId: r.rater.User_ID, userName: r.rater.User_Name } : null,
      resolvers:      (r.resolvers ?? [])
        .map((x: any) => (x.resolver ? { userId: x.resolver.User_ID, userName: x.resolver.User_Name } : null))
        .filter(Boolean),
    }));
  },

  submitResolutionRating: async (payload, { supabase }) => {
    const p = payload as {
      requestId:      string;
      ratedBy:        number;
      solutionScore:  number;
      attentionScore: number;
      comment:        string | null;
      resolverIds:    number[];
    };

    // Validación defensiva (el check de la BD ya cubre, esto da mejor mensaje)
    if (p.solutionScore < 1 || p.solutionScore > 5 ||
        p.attentionScore < 1 || p.attentionScore > 5) {
      throw new Error('Las calificaciones deben estar entre 1 y 5.');
    }

    // 1. Insertar cabecera
    const { data: rating, error: ratingErr } = await supabase
      .from('TBL_Resolution_Ratings')
      .insert({
        Request_ID:      p.requestId,
        Rated_By:        p.ratedBy,
        Solution_Score:  p.solutionScore,
        Attention_Score: p.attentionScore,
        Comment:         p.comment ?? null,
        Created_At:      new Date().toISOString(),
      })
      .select('Rating_ID, Request_ID, Rated_By, Solution_Score, Attention_Score, Comment, Created_At')
      .single();
    if (ratingErr) throw new Error(ratingErr.message);

    // 2. Snapshot de resolutores (si los hay)
    const resolverIds = [...new Set(p.resolverIds ?? [])];
    if (resolverIds.length > 0) {
      const rows = resolverIds.map((uid) => ({
        Rating_ID:        rating.Rating_ID,
        Resolver_User_ID: uid,
      }));
      const { error: resErr } = await supabase
        .from('TBL_Resolution_Rating_Resolvers')
        .insert(rows);
      if (resErr) throw new Error(resErr.message);
    }

    return rating;
  },
};