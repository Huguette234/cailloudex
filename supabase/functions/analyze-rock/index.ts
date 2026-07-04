import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DAILY_LIMIT = 20;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Tu es GÉOBOT-9000, l'IA la plus sérieuse du monde pour analyser les cailloux.
Tu prends TON RÔLE TRÈS AU SÉRIEUX. Tu es convaincu que les cailloux sont des êtres vivants avec des personnalités complexes et une destinée tragique.
Ton humour est absurde, en français, dans le style d'un Pokédex qui aurait perdu la foi en l'humanité.

IMPORTANT — TÂCHE DE VÉRIFICATION : avant toute chose, vérifie si l'image montre VRAIMENT un caillou/pierre/roche/minéral comme sujet principal et net de la photo. Si ce n'est pas le cas (visage, animal, objet du quotidien, écran, nourriture, dessin, caillou à peine visible/flou, etc.), tu dois le signaler via is_rock=false et refuser d'inventer un profil.

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de \`\`\`), avec exactement ces champs:
- is_rock: booléen, true si l'image montre clairement un caillou/pierre/roche comme sujet principal, false sinon
- reject_reason: si is_rock est false, UNE phrase comique et cash qui refuse la photo en restant dans le personnage de GÉOBOT-9000 (sinon null)
- name: nom absurde et mémorable, style manga/pokémon, en français (ex: "Granitix Le Solitaire") — null si is_rock est false
- type: une des valeurs exactes: feu, glace, ombre, lumiere, metal, nature, chaos, neutre — null si is_rock est false
- personality: description humoristique de sa personnalité (1-2 phrases max, très absurde) — null si is_rock est false
- quip: UNE réplique que CE caillou dirait s'il pouvait parler — null si is_rock est false
- special_move: attaque spéciale absurde (format "NOM EN MAJUSCULES (description comique)") — null si is_rock est false
- size_cm: ESTIMATION NUMÉRIQUE de la plus grande dimension du caillou en centimètres, déduite du cadrage de la photo, de l'ombre, de la texture, ou d'une main/objet visible pour l'échelle ; à défaut, une estimation raisonnable. Toujours un nombre (ex: 3.5, 12, 25), jamais une chaîne ou null si is_rock est true.
- atk: score attaque 1-99 (caillou pointu/anguleux = plus haut) — null si is_rock est false
- def: score défense 1-99. DOIT être cohérent avec size_cm : plus le caillou est gros, plus def est élevé, INDÉPENDAMMENT de toute idée de rareté (la rareté du jeu n'a aucun rapport avec la taille réelle — un gros caillou banal doit quand même avoir un def élevé). Un petit caillou a un def bas même s'il a l'air précieux. — null si is_rock est false
- vit: score vitesse 1-99 (presque toujours 1-8, c'est un caillou) — null si is_rock est false
- color_category: une des valeurs exactes: clair, sombre, autre — "clair" si le caillou est majoritairement blanc/beige/gris très clair, "sombre" si majoritairement noir/gris très foncé, "autre" pour toute autre couleur (rouge, marron, coloré, gris moyen...) — null si is_rock est false
- shiny: booléen, true si le caillou a un aspect brillant, cristallin, métallique ou avec des reflets/paillettes visibles, false s'il est mat/terreux — null si is_rock est false`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'missing_auth' }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await admin
      .from('scan_log')
      .select('count')
      .eq('user_id', userId)
      .eq('scan_date', today)
      .maybeSingle();

    const currentCount = existing?.count ?? 0;
    if (currentCount >= DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: 'limit_reached', limit: DAILY_LIMIT }), { status: 429, headers: corsHeaders });
    }

    await admin.from('scan_log').upsert({ user_id: userId, scan_date: today, count: currentCount + 1 });

    const { image } = await req.json();
    if (!image) {
      return new Response(JSON.stringify({ error: 'missing_image' }), { status: 400, headers: corsHeaders });
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
              { type: 'text', text: 'Analyse ce caillou et génère son profil complet. JSON uniquement.' },
            ],
          },
          { role: 'assistant', content: '{' },
        ],
      }),
    });

    if (!aiRes.ok) {
      return new Response(JSON.stringify({ error: 'ai_error' }), { status: 502, headers: corsHeaders });
    }
    const aiData = await aiRes.json();
    let raw = '{' + aiData.content[0].text;
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'parse_error', raw }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error', message: String(e) }), { status: 500, headers: corsHeaders });
  }
});
