import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';

/* =========================================================================
   generate-outfit — "Studio IA" à rendu constant
   -------------------------------------------------------------------------
   Objectif : produire TOUJOURS le même visuel (même personne, même fond,
   même cadrage, même lumière) et ne faire varier qu'une seule chose :
   le vêtement photographié par l'utilisateur.

   Tout ce qui pourrait introduire du hasard est figé ici, côté serveur :
     - la graine (seed) est une constante, jamais un Date.now()
     - les prompts sont des constantes choisies par clé (le client envoie
       une clé de décor, pas du texte libre)
     - les réglages du modèle (mode, guidance, format) ne bougent pas

   Trois modes :
     - 'tryon' : le vêtement est enfilé sur la photo de référence
                 (même personne + même fond à chaque fois)
     - 'scene' : le vêtement est reposé sur un décor fixe (photo à plat)
     - 'model' : fabrique une fois la personne de référence, avec la même
                 graine et le même prompt — donc toujours la même personne
   ========================================================================= */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FAL_KEY = Deno.env.get('FAL_KEY') || Deno.env.get('FAL_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Graine figée : c'est elle qui garantit un rendu reproductible. */
const STUDIO_SEED = 424242;

/** Décors autorisés pour le mode 'scene'. Le client envoie la clé, jamais le texte. */
const SCENE_PRESETS: Record<string, string> = {
  beton:
    'Place the exact same garment, completely unchanged in color, fabric, logo, labels and shape, laid flat and neatly arranged on a smooth pale grey concrete surface, straight top-down view, centered in frame, soft diffused daylight from the upper left, one gentle natural shadow, no props, no text, no hands, clean minimal second-hand marketplace product photo',
  lin:
    'Place the exact same garment, completely unchanged in color, fabric, logo, labels and shape, laid flat and neatly arranged on a plain warm beige linen backdrop, straight top-down view, centered in frame, soft diffused studio light, subtle soft shadow, no props, no text, no hands, clean minimal second-hand marketplace product photo',
  studio:
    'Place the exact same garment, completely unchanged in color, fabric, logo, labels and shape, laid flat and neatly arranged on a seamless off-white studio backdrop, straight top-down view, centered in frame, even softbox lighting, very soft shadow, no props, no text, no hands, clean minimal e-commerce product photo',
  parquet:
    'Place the exact same garment, completely unchanged in color, fabric, logo, labels and shape, laid flat and neatly arranged on a light oak wooden floor, straight top-down view, centered in frame, soft window daylight from the left, gentle natural shadow, no props, no text, no hands, clean minimal second-hand marketplace product photo',
};

/**
 * Personne de référence fabriquée par l'IA. Prompt + graine constants : la
 * même personne, la même pose et le même mur ressortent à chaque appel.
 * Elle est ensuite enregistrée côté app et sert de scène à tous les essayages.
 */
const MODEL_PRESETS: Record<string, string> = {
  neutre:
    'Full body fashion lookbook photo of one adult person standing straight and facing the camera, arms relaxed along the body, neutral friendly expression, wearing a plain white t-shirt and plain light grey shorts, entire body visible from head to shoes, centered, plain smooth light grey concrete wall background, soft even daylight, no props, no text, no logo, photorealistic, sharp focus',
  studio:
    'Full body fashion lookbook photo of one adult person standing straight and facing the camera, arms relaxed along the body, neutral friendly expression, wearing a plain white t-shirt and plain light grey shorts, entire body visible from head to shoes, centered, seamless off-white studio backdrop, soft softbox lighting, no props, no text, no logo, photorealistic, sharp focus',
};

/** Consigne figée pour le repli "essayage" via un modèle d'édition multi-images. */
const TRYON_FALLBACK_PROMPT =
  'Dress the person from the first image in the garment from the second image. Keep the person, the pose, the framing, the lighting and the background of the first image strictly identical — change only the clothing. The garment must keep its exact color, fabric, logo, labels and proportions.';

const CATEGORIES = new Set(['auto', 'tops', 'bottoms', 'one-pieces']);

type FalAttempt = { endpoint: string; body: Record<string, unknown> };

/** Un data URI ou une URL http(s) : les deux sont acceptés par fal en entrée. */
function isUsableImage(v: unknown): v is string {
  return typeof v === 'string' && (v.startsWith('data:image/') || v.startsWith('https://'));
}

/** Récupère l'image produite et la renvoie en base64 (comme generate-character). */
async function imageToBase64(url: string, fallbackMime: string) {
  if (url.startsWith('data:')) {
    const parts = url.split(',');
    const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || fallbackMime;
    return { base64: parts[1] || '', mimeType: mime };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  const buf = new Uint8Array(await res.arrayBuffer());
  return { base64: encodeBase64(buf), mimeType: res.headers.get('content-type') || fallbackMime };
}

/**
 * Essaie les endpoints fal dans l'ordre et s'arrête au premier qui répond une
 * image. Les repli successifs servent uniquement de filet de sécurité si un
 * modèle est retiré ou renommé : les réglages restent identiques partout.
 */
async function runFal(attempts: FalAttempt[]) {
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const res = await fetch(`https://fal.run/${attempt.endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.body),
        signal: AbortSignal.timeout(150000),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        errors.push(`${attempt.endpoint}: HTTP ${res.status} ${t.slice(0, 160)}`);
        continue;
      }
      const j = await res.json();
      const img = j?.images?.[0] || j?.image;
      const url = typeof img === 'string' ? img : img?.url;
      if (!url) {
        errors.push(`${attempt.endpoint}: réponse sans image`);
        continue;
      }
      const { base64, mimeType } = await imageToBase64(url, img?.content_type || 'image/jpeg');
      if (!base64) {
        errors.push(`${attempt.endpoint}: image vide`);
        continue;
      }
      return { base64, mimeType, engine: attempt.endpoint, errors };
    } catch (e) {
      errors.push(`${attempt.endpoint}: ${String(e).slice(0, 160)}`);
    }
  }
  return { base64: '', mimeType: '', engine: '', errors };
}

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

    if (!FAL_KEY) {
      return new Response(
        JSON.stringify({ error: 'fal_not_configured', details: 'La clé FAL_KEY n\'est pas configurée sur le projet Supabase.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const mode = body?.mode === 'scene' ? 'scene' : body?.mode === 'model' ? 'model' : 'tryon';
    const garment = body?.garment_image;
    const scene = body?.scene_image;
    const category = CATEGORIES.has(body?.category) ? body.category : 'auto';
    const presetKey = typeof body?.preset === 'string' && SCENE_PRESETS[body.preset] ? body.preset : 'beton';
    const modelKey = typeof body?.preset === 'string' && MODEL_PRESETS[body.preset] ? body.preset : 'neutre';

    if (mode !== 'model' && !isUsableImage(garment)) {
      return new Response(JSON.stringify({ error: 'missing_garment' }), { status: 400, headers: corsHeaders });
    }

    let attempts: FalAttempt[];

    if (mode === 'model') {
      const modelBody = {
        prompt: MODEL_PRESETS[modelKey],
        seed: STUDIO_SEED,
        image_size: 'portrait_4_3',
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: 'jpeg',
        enable_safety_checker: true,
      };
      attempts = [
        { endpoint: 'fal-ai/flux/dev', body: modelBody },
        { endpoint: 'fal-ai/flux/schnell', body: { ...modelBody, num_inference_steps: 4 } },
      ];
    } else if (mode === 'tryon') {
      if (!isUsableImage(scene)) {
        return new Response(JSON.stringify({ error: 'missing_scene' }), { status: 400, headers: corsHeaders });
      }
      const tryonBody = {
        model_image: scene,
        garment_image: garment,
        category,
        mode: 'balanced',
        garment_photo_type: 'auto',
        num_samples: 1,
        seed: STUDIO_SEED,
        output_format: 'jpeg',
      };
      const multiBody = {
        prompt: TRYON_FALLBACK_PROMPT,
        image_urls: [scene, garment],
        seed: STUDIO_SEED,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: 'jpeg',
        aspect_ratio: '3:4',
      };
      attempts = [
        { endpoint: 'fal-ai/fashn/tryon/v1.6', body: tryonBody },
        { endpoint: 'fal-ai/fashn/tryon/v1.5', body: tryonBody },
        { endpoint: 'fal-ai/flux-pro/kontext/multi', body: multiBody },
        { endpoint: 'fal-ai/flux-pro/kontext/max/multi', body: multiBody },
      ];
    } else {
      const sceneBody = {
        prompt: SCENE_PRESETS[presetKey],
        image_url: garment,
        seed: STUDIO_SEED,
        guidance_scale: 3.5,
        num_images: 1,
        output_format: 'jpeg',
        aspect_ratio: '3:4',
        safety_tolerance: '2',
      };
      attempts = [
        { endpoint: 'fal-ai/flux-pro/kontext', body: sceneBody },
        { endpoint: 'fal-ai/flux-pro/kontext/max', body: sceneBody },
      ];
    }

    const out = await runFal(attempts);
    if (!out.base64) {
      return new Response(
        JSON.stringify({ error: 'generation_failed', details: out.errors.join(' | ').slice(0, 600) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        image: out.base64,
        mime_type: out.mimeType,
        engine: out.engine,
        mode,
        preset: mode === 'scene' ? presetKey : mode === 'model' ? modelKey : null,
        seed: STUDIO_SEED,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error', message: String(e) }), { status: 500, headers: corsHeaders });
  }
});
