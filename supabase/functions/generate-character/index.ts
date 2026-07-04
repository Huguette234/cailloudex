import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { rock_name, rock_type, rock_personality, rock_size_cm, rock_rarity, rock_atk, rock_def, rock_vit } = await req.json();

    const name = rock_name || 'a mysterious rock';
    const type = rock_type || 'neutre';
    const personality = rock_personality ? rock_personality.slice(0, 100) : '';

    // --- Taille physique du personnage ---
    const sizeCm = Number(rock_size_cm) || 0;
    const sizeDesc = sizeCm > 15 ? 'giant massive imposing body, very large and dominant'
      : sizeCm > 8  ? 'large sturdy body, big and solid'
      : sizeCm > 3  ? 'medium-sized compact body'
      : sizeCm > 0  ? 'tiny miniature body, extremely small and cute/menacing'
      : 'medium-sized body';

    // --- Rareté ---
    const rarityDesc = rock_rarity === 'legendaire' ? 'legendary aura, extra ornate crown and majestic regalia'
      : rock_rarity === 'epique' ? 'epic glowing aura, impressive ornate details'
      : rock_rarity === 'rare' ? 'rare shimmering quality, subtle glow'
      : '';

    // --- ATK → bras et posture offensive (1-99) ---
    const atk = Number(rock_atk) || 10;
    const atkDesc = atk >= 75 ? 'hyper-muscular giant arms, colossal fists, brawler build'
      : atk >= 50 ? 'muscular arms, large fists, strong athletic build'
      : atk >= 25 ? 'average arms, modest fists, neutral build'
      : 'tiny twig arms, noodle hands, fragile weak build';

    // --- DEF → corps, armure, largeur (1-99) ---
    const def = Number(rock_def) || 10;
    const defDesc = def >= 75 ? 'massively wide tank body, thick fortress armor plates everywhere, indestructible bulk'
      : def >= 50 ? 'stocky body with solid chest armor plating, wide stance'
      : def >= 25 ? 'slim build, few small armor chips, somewhat fragile'
      : 'paper-thin cracked shell, no armor, very skinny and breakable';

    // --- VIT → posture, lignes de vitesse (presque toujours 1-8 pour un caillou) ---
    const vit = Number(rock_vit) || 1;
    const vitDesc = vit >= 20 ? 'extreme speed blur, lightning trails, aerodynamic streamlined body'
      : vit >= 8  ? 'dynamic sprint pose, motion speed lines behind, surprisingly fast'
      : vit >= 5  ? 'alert ready stance, light footing, slightly energetic'
      : vit >= 3  ? 'slow heavy footing, sluggish plodding posture'
      : 'frozen statue pose, planted like a tombstone, zero movement';

    // --- Style visuel par type ---
    const TYPE_STYLE: Record<string, string> = {
      chaos:   'entirely hot pink and magenta colored rock body, pink lightning aura, neon magenta glowing cracks, chaotic electric sparks, pink and purple energy swirling around',
      ombre:   'deep purple and dark violet colored rock body, glowing purple eyes, shadow tendrils, dark mist aura, eerie purple magical symbols floating around',
      feu:     'bright orange and red colored rock body, flames bursting from the top, fire aura, glowing orange cracks, small fire explosions around, warm red-orange color palette',
      metal:   'shiny silver and chrome colored rock body, metallic gleam, glowing blue circuit lines on body, steel-colored armor plating texture, reflective surface, cold steel aura',
      nature:  'vivid green colored rock body covered in moss and tiny flowers, leaves growing from head, earthy green aura, small plants and vines around, fresh green color palette',
      lumiere: 'bright golden and yellow colored rock body, radiant sunlight beams radiating outward, golden sparkles everywhere, glowing white halo above, brilliant yellow-gold color palette',
      glace:   'icy blue and cyan colored rock body, ice crystals growing on surface, snowflakes floating around, cold blue mist aura, frozen spikes, pale blue and white color palette',
      neutre:  'plain grey stone colored rock body, simple solid shape, soft grey aura, minimal decoration',
    };

    const typeStyle = TYPE_STYLE[type] || TYPE_STYLE['neutre'];

    const VILLAIN_TYPES = ['chaos', 'ombre', 'feu', 'metal'];
    const HERO_TYPES = ['nature', 'lumiere', 'glace'];
    const isVillain = VILLAIN_TYPES.includes(type);
    const isHero = HERO_TYPES.includes(type);

    const statDesc = `${atkDesc}, ${defDesc}, ${vitDesc}`;

    const prompt = isVillain
      ? `villain chibi anime character that is an evil anthropomorphized rock named ${name}, ${sizeDesc}, ${rarityDesc}, ${personality}, ${typeStyle}, ${statDesc}, menacing glowing eyes, sharp angry eyebrows, sinister grin with sharp teeth, dramatic evil pose, comically villainous, unique individual look, full body, white background, manga art style`
      : isHero
      ? `friendly hero chibi anime character that is a kind anthropomorphized rock named ${name}, ${sizeDesc}, ${rarityDesc}, ${personality}, ${typeStyle}, ${statDesc}, big sparkling cute eyes, warm happy smile, cheerful heroic pose, wholesome and adorable, unique individual look, full body, white background, manga art style`
      : `fierce chibi anime character that is an intense anthropomorphized rock named ${name}, ${sizeDesc}, ${rarityDesc}, ${personality}, ${typeStyle}, ${statDesc}, determined sharp eyes, serious expression, battle-ready pose, comically serious and powerful, unique individual look, full body, white background, manga art style`;

    const encoded = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&model=flux&nologo=true&seed=${Date.now()}`;

    console.log('Calling Pollinations:', url.slice(0, 150));

    let pollRes: Response | null = null;
    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        pollRes = await fetch(url, { signal: AbortSignal.timeout(45000) });
        console.log(`Attempt ${attempt}: status ${pollRes.status}`);
        if (pollRes.ok) break;
        lastError = `HTTP ${pollRes.status}`;
        pollRes = null;
      } catch (e) {
        lastError = String(e);
        console.log(`Attempt ${attempt} failed: ${lastError}`);
        pollRes = null;
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }

    if (!pollRes) {
      return new Response(JSON.stringify({ error: 'pollinations_unavailable', details: lastError }), { status: 502, headers: corsHeaders });
    }

    const buffer = await pollRes.arrayBuffer();
    const base64 = encodeBase64(new Uint8Array(buffer));
    const mimeType = pollRes.headers.get('content-type') || 'image/jpeg';

    return new Response(
      JSON.stringify({ image: base64, mime_type: mimeType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error', message: String(e) }), { status: 500, headers: corsHeaders });
  }
});
