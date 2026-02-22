/**
 * AI Asset Generator — Cosmic Protocol
 *
 * Uses Workers AI to:
 * 1. Generate game asset images with stable-diffusion-xl-base-1.0
 * 2. Generate names/descriptions with GLM-4.7-Flash
 * 3. Upload the image to R2
 * 4. Return the public URL + NFT-compatible metadata
 */

export interface GenerateAssetRequest {
  assetType: 'ship_skin' | 'planet_theme' | 'booster' | 'rare_ship';
  style?: string; // e.g. 'cyberpunk', 'steampunk', 'alien', 'organic', 'crystal'
  rarity?: 'common' | 'uncommon' | 'rare' | 'legendary';
}

export interface GeneratedAsset {
  imageUrl: string;
  imageBase64: string;
  name: string;
  description: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

interface CloudflareAssetEnv {
  AI: Ai;
  R2: R2Bucket;
}

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

const RARITY_COLORS: Record<string, string> = {
  common: 'gray, white',
  uncommon: 'green, teal',
  rare: 'blue, royal blue',
  legendary: 'orange, gold, fire',
};

function buildImagePrompt(req: GenerateAssetRequest): string {
  const style = req.style ?? 'futuristic';
  const rarity = req.rarity ?? 'common';
  const rarityColor = RARITY_COLORS[rarity] ?? 'white';

  switch (req.assetType) {
    case 'ship_skin':
      return (
        `Detailed spaceship design, ${style} style, game asset, ` +
        `transparent background, high detail, sci-fi, ${rarityColor} color scheme, ` +
        `glowing engine trails, metallic hull, top-down view, digital art, 4k`
      );

    case 'rare_ship':
      return (
        `Epic legendary spaceship, ${style} style, massive warship, ` +
        `${rarityColor} glowing energy weapons, dramatic lighting, ` +
        `sci-fi game asset, transparent background, ultra detailed, 4k`
      );

    case 'planet_theme':
      return (
        `Fantasy planet from space, ${style} aesthetic, space game art, ` +
        `vibrant ${rarityColor} colors, atmospheric glow, orbiting rings, ` +
        `digital painting, game background, detailed surface features`
      );

    case 'booster':
      return (
        `Game item icon, ${rarity} quality, ${style} style, ` +
        `${rarityColor} glowing aura, sci-fi energy crystal, ` +
        `fantasy game powerup icon, transparent background, centered, 4k`
      );

    default:
      return `Space game asset, ${style}, ${rarity} rarity, sci-fi digital art`;
  }
}

// ---------------------------------------------------------------------------
// Name / description generation (GLM-4.7-Flash)
// ---------------------------------------------------------------------------

async function generateMetadata(
  req: GenerateAssetRequest,
  env: CloudflareAssetEnv
): Promise<{ name: string; description: string }> {
  const style = req.style ?? 'futuristic';
  const rarity = req.rarity ?? 'common';

  const typeLabel: Record<string, string> = {
    ship_skin: 'spaceship skin',
    planet_theme: 'planet theme',
    booster: 'gameplay booster',
    rare_ship: 'rare legendary ship',
  };

  const prompt =
    `Generate a name and short description for a ${rarity} rarity ${typeLabel[req.assetType] ?? req.assetType} ` +
    `in a ${style} style for a space strategy game called Cosmic Protocol. ` +
    `Respond ONLY with JSON, no markdown:\n` +
    `{"name":"<short name, max 5 words>","description":"<1-2 sentences, lore-flavored>"}`;

  try {
    const response = await (env.AI as unknown as {
      run(model: string, input: Record<string, unknown>): Promise<{ response?: string }>;
    }).run('@cf/thudm/glm-4-0520', {
      messages: [
        {
          role: 'system',
          content:
            'You are a lore writer for a space strategy game. Respond only with compact JSON, no extra text.',
        },
        { role: 'user', content: prompt },
      ],
    });

    let raw = String(response?.response ?? '');

    // Strip markdown code fences if present
    if (raw.includes('```json')) {
      raw = raw.split('```json')[1]?.split('```')[0] ?? raw;
    } else if (raw.includes('```')) {
      raw = raw.split('```')[1]?.split('```')[0] ?? raw;
    }

    const parsed = JSON.parse(raw.trim()) as { name: string; description: string };
    if (parsed.name && parsed.description) {
      return { name: parsed.name, description: parsed.description };
    }
  } catch (err) {
    console.warn('[assetGenerator] GLM metadata generation failed:', err);
  }

  // Fallback names if AI call fails
  const fallbackNames: Record<string, string> = {
    ship_skin: `${style.charAt(0).toUpperCase() + style.slice(1)} Hull Plating`,
    planet_theme: `${style.charAt(0).toUpperCase() + style.slice(1)} World`,
    booster: `${rarity.charAt(0).toUpperCase() + rarity.slice(1)} Energy Core`,
    rare_ship: `${style.charAt(0).toUpperCase() + style.slice(1)} Dreadnought`,
  };

  return {
    name: fallbackNames[req.assetType] ?? 'Unknown Asset',
    description: `A ${rarity} ${req.assetType.replace('_', ' ')} with ${style} aesthetics.`,
  };
}

// ---------------------------------------------------------------------------
// Image generation (Stable Diffusion XL Base 1.0)
// ---------------------------------------------------------------------------

async function generateImage(
  prompt: string,
  env: CloudflareAssetEnv
): Promise<Uint8Array> {
  const response = await (env.AI as unknown as {
    run(
      model: string,
      input: Record<string, unknown>
    ): Promise<ReadableStream | Uint8Array | { image?: string }>;
  }).run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
    prompt,
    num_steps: 20,
  });

  // Workers AI SDXL returns a ReadableStream of binary PNG data
  if (response instanceof ReadableStream) {
    const reader = response.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  // Some environments return a Uint8Array directly
  if (response instanceof Uint8Array) {
    return response;
  }

  // Fallback: try to decode base64 image field
  const maybeBase64 = (response as { image?: string }).image;
  if (maybeBase64) {
    const binary = atob(maybeBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  throw new Error('Unexpected AI image response format');
}

// ---------------------------------------------------------------------------
// R2 upload
// ---------------------------------------------------------------------------

async function uploadToR2(
  imageBytes: Uint8Array,
  key: string,
  env: CloudflareAssetEnv
): Promise<string> {
  await env.R2.put(key, imageBytes, {
    httpMetadata: { contentType: 'image/png' },
  });

  // R2 public URL pattern (adjust to your custom domain / public bucket URL)
  return `https://assets.cosmicprotocol.io/${key}`;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function generateAsset(
  req: GenerateAssetRequest,
  env: CloudflareAssetEnv
): Promise<GeneratedAsset> {
  const style = req.style ?? 'futuristic';
  const rarity = req.rarity ?? 'common';

  // 1. Build image prompt
  const imagePrompt = buildImagePrompt(req);

  // 2. Generate image + metadata in parallel
  const [imageBytes, metadata] = await Promise.all([
    generateImage(imagePrompt, env),
    generateMetadata(req, env),
  ]);

  // 3. Upload to R2
  const assetId = `${req.assetType}-${style}-${rarity}-${Date.now()}`;
  const r2Key = `assets/${assetId}.png`;
  const imageUrl = await uploadToR2(imageBytes, r2Key, env);

  // 4. Build base64 for immediate preview in API response
  let binary = '';
  for (let i = 0; i < imageBytes.length; i++) {
    binary += String.fromCharCode(imageBytes[i]!);
  }
  const imageBase64 = btoa(binary);

  // 5. Build NFT-compatible attributes
  const attributes: Array<{ trait_type: string; value: string | number }> = [
    { trait_type: 'Type', value: req.assetType.replace('_', ' ') },
    { trait_type: 'Style', value: style },
    { trait_type: 'Rarity', value: rarity },
    {
      trait_type: 'Rarity Score',
      value: { common: 1, uncommon: 2, rare: 3, legendary: 4 }[rarity] ?? 1,
    },
    { trait_type: 'Game', value: 'Cosmic Protocol' },
    { trait_type: 'Chain', value: 'Solana' },
  ];

  return {
    imageUrl,
    imageBase64,
    name: metadata.name,
    description: metadata.description,
    attributes,
  };
}
