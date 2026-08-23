/**
 * Discord shop collectibles: fetch catalog via API, download assets on demand from CDN.
 * Token stays in the main process (electron-store or DISCORD_TOKEN env).
 */

const ITEM_TYPE_FOLDER = {
  0: 'avatar-decorations',
  1: 'profile-effects',
  2: 'nameplates',
};

const ITEM_TYPE_KEY = {
  0: 'avatar_decoration',
  1: 'profile_effect',
  2: 'nameplate',
};

const CDN_BASE = 'https://cdn.discordapp.com';
const CDN_HOST_RE = /(^|\.)(discordapp\.com|discordapp\.net|discord\.com)$/i;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0 Chrome/120 Electron/28 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toAuthHeader(token) {
  if (!token) return null;
  const t = String(token).trim();
  if (/^bot\s+/i.test(t)) return `Bot ${t.replace(/^bot\s+/i, '')}`;
  return t;
}

function isCdnUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('http')) return false;
  try {
    return CDN_HOST_RE.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

function basenameFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const last = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '');
    return last || 'asset';
  } catch {
    return 'asset';
  }
}

function guessMimeType(filename) {
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function deepCollectUrls(node, acc = new Set()) {
  if (node == null) return acc;
  if (typeof node === 'string') {
    if (isCdnUrl(node)) acc.add(node);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const v of node) deepCollectUrls(v, acc);
    return acc;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) deepCollectUrls(v, acc);
  }
  return acc;
}

function urlsForItem(item) {
  const out = [];
  const seen = new Set();

  function push(url, filename, role) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, filename, role: role || filename });
  }

  for (const url of deepCollectUrls(item)) {
    let role = basenameFromUrl(url);
    if (item.thumbnailPreviewSrc === url) role = 'thumbnail';
    else if (item.reducedMotionSrc === url) role = 'reduced_motion';
    else if (Array.isArray(item.effects)) {
      const effectIndex = item.effects.findIndex((effect) => effect?.src === url);
      if (effectIndex >= 0) role = `effect_${effectIndex}`;
    }
    push(url, basenameFromUrl(url), role);
  }

  if (item.type === 0 && item.asset) {
    const base = `${CDN_BASE}/avatar-decoration-presets/${item.asset}.png`;
    push(`${base}?passthrough=true`, 'animated.png', 'animated');
    push(`${base}?passthrough=false`, 'static.png', 'static');
  }

  if (item.type === 2 && item.asset) {
    const assetPath = String(item.asset).replace(/^\/+/, '');
    push(`${CDN_BASE}/assets/collectibles/${assetPath}static.png`, 'static.png', 'static');
    push(`${CDN_BASE}/assets/collectibles/${assetPath}asset.webm`, 'asset.webm', 'animated');
  }

  return out;
}

function decimalRgbToCss(color) {
  const value = Number(color) >>> 0;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgb(${r}, ${g}, ${b})`;
}

function gradientFromColors(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return undefined;
  if (colors.length === 1) return decimalRgbToCss(colors[0]);
  return `linear-gradient(135deg, ${decimalRgbToCss(colors[0])}, ${decimalRgbToCss(colors[1])})`;
}

function previewAspectRatioForItem(item) {
  if (item.type === 0) return 1;
  if (item.type === 2) return 448 / 84;
  const firstEffect = item.effects?.[0];
  if (firstEffect?.width && firstEffect?.height) {
    return firstEffect.width / firstEffect.height;
  }
  return 450 / 880;
}

function formatPaletteName(palette) {
  if (!palette) return undefined;
  return String(palette)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const NAMEPLATE_PALETTE_GRADIENTS = {
  crimson: 'linear-gradient(135deg, #5c0a1c, #dc143c)',
  berry: 'linear-gradient(135deg, #4a1030, #c42d78)',
  sky: 'linear-gradient(135deg, #0a2a5c, #3b8eed)',
  teal: 'linear-gradient(135deg, #0a3d3d, #2dd4bf)',
  forest: 'linear-gradient(135deg, #0a2e1a, #22c55e)',
  bubble_gum: 'linear-gradient(135deg, #4a1038, #f472b6)',
  violet: 'linear-gradient(135deg, #2d1050, #8b5cf6)',
  cobalt: 'linear-gradient(135deg, #0a1448, #3b5bdb)',
  clover: 'linear-gradient(135deg, #0a3d20, #4ade80)',
  lemon: 'linear-gradient(135deg, #4a3d0a, #fbbf24)',
  white: 'linear-gradient(135deg, #888888, #f0f0f0)',
  black: 'linear-gradient(135deg, #1a1a1a, #404040)',
};

function nameplatePaletteGradient(palette) {
  if (!palette) return undefined;
  return NAMEPLATE_PALETTE_GRADIENTS[palette];
}

function thumbnailForItem(item) {
  if (item.thumbnailPreviewSrc && isCdnUrl(item.thumbnailPreviewSrc)) {
    return item.thumbnailPreviewSrc;
  }
  if (item.type === 0 && item.asset) {
    return `${CDN_BASE}/avatar-decoration-presets/${item.asset}.png?passthrough=false`;
  }
  if (item.type === 2 && item.asset) {
    const assetPath = String(item.asset).replace(/^\/+/, '');
    return `${CDN_BASE}/assets/collectibles/${assetPath}static.png`;
  }
  const assets = urlsForItem(item);
  return assets[0]?.url;
}

function* walkProduct(product, category) {
  yield { product, category };
  for (const bundled of product.bundled_products ?? []) {
    yield* walkProduct(bundled, category);
  }
  for (const variant of product.variants ?? []) {
    yield* walkProduct(variant, category);
  }
}

function* walkProducts(categories) {
  for (const category of categories ?? []) {
    for (const product of category.products ?? []) {
      yield* walkProduct(product, category);
    }
  }
}

function extractCollectibleItems(categories) {
  const items = [];
  const seenItems = new Set();

  for (const { product, category } of walkProducts(categories)) {
    const categoryName = category?.name || 'Unknown';
    for (const item of product.items ?? []) {
      if (![0, 1, 2].includes(item.type)) continue;

      const skuId = String(item.sku_id ?? item.id ?? product.sku_id ?? 'unknown');
      const itemKey = `${item.type}:${skuId}:${item.id ?? ''}`;
      if (seenItems.has(itemKey)) continue;
      seenItems.add(itemKey);

      const assets = urlsForItem(item);
      if (assets.length === 0) continue;

      const productName = product.name || item.title || item.label || skuId;
      const typeKey = ITEM_TYPE_KEY[item.type];

      const entry = {
        id: `${typeKey}:${skuId}`,
        skuId,
        name: productName,
        type: typeKey,
        category: categoryName,
        label: item.label ?? item.title ?? productName,
        thumbnailUrl: thumbnailForItem(item),
        previewAspectRatio: previewAspectRatioForItem(item),
        previewColors: product.styles?.background_colors,
        palette: item.type === 2 ? item.palette : undefined,
        paletteLabel: item.type === 2 ? formatPaletteName(item.palette) : undefined,
        previewGradient: item.type === 2 ? nameplatePaletteGradient(item.palette) : undefined,
        assets: assets.map((a) => ({
          role: a.role,
          url: a.url,
          filename: a.filename,
          mimeType: guessMimeType(a.filename),
        })),
      };

      if (item.type === 1) {
        entry.effect = {
          animationType: item.animationType,
          thumbnailPreviewSrc: item.thumbnailPreviewSrc,
          reducedMotionSrc: item.reducedMotionSrc,
          effects: item.effects,
        };
      }

      items.push(entry);
    }
  }

  return items;
}

async function apiRequest(path, authorization, { retries = 4 } = {}) {
  if (!authorization) {
    throw new Error('No Discord token configured. Add one in Profile settings.');
  }

  const url = `https://discord.com/api/v10${path}`;
  const headers = {
    Authorization: authorization,
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'application/json',
  };

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 1;
      await sleep((retryAfter + 0.5) * 1000);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Discord returned ${res.status}. Your token is missing, invalid, or expired.`
      );
    }

    if (!res.ok) {
      if (attempt >= retries) {
        const body = await res.text().catch(() => '');
        throw new Error(`Discord API error: ${res.status} ${res.statusText} ${body}`);
      }
      await sleep(500 * 2 ** attempt);
      continue;
    }

    return res.json();
  }
}

async function fetchCatalog(authorization) {
  const params = new URLSearchParams({
    country_code: 'US',
    include_bundles: 'true',
    include_nameplates_on_mobile: 'true',
  });

  const data = await apiRequest(`/collectibles-categories?${params.toString()}`, authorization);
  const categories = Array.isArray(data) ? data : data?.categories ?? [];
  return { categories, items: extractCollectibleItems(categories) };
}

async function downloadAsset(url, { retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: '*/*' },
      });
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(500 * 2 ** attempt);
      continue;
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 1;
      await sleep((retryAfter + 0.5) * 1000);
      continue;
    }

    if (!res.ok) {
      if (attempt >= retries) {
        throw new Error(`Failed to download asset: ${res.status} ${res.statusText}`);
      }
      await sleep(500 * 2 ** attempt);
      continue;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  }
}

function createDiscordCollectiblesService(store) {
  let catalogCache = null;
  let catalogCacheAt = 0;
  const CATALOG_TTL_MS = 30 * 60 * 1000;

  function getToken() {
    const fromStore = store.get('discordCollectiblesToken');
    if (fromStore) return String(fromStore);
    if (process.env.DISCORD_TOKEN) return String(process.env.DISCORD_TOKEN);
    return null;
  }

  function setToken(token) {
    if (!token || !String(token).trim()) {
      store.delete('discordCollectiblesToken');
      catalogCache = null;
      return { success: true };
    }
    store.set('discordCollectiblesToken', String(token).trim());
    catalogCache = null;
    return { success: true };
  }

  function clearToken() {
    store.delete('discordCollectiblesToken');
    catalogCache = null;
    return { success: true };
  }

  function hasToken() {
    return Boolean(getToken());
  }

  async function getCatalog({ force = false } = {}) {
    const authorization = toAuthHeader(getToken());
    if (!authorization) {
      return { success: false, error: 'No Discord token configured.' };
    }

    const now = Date.now();
    if (!force && catalogCache && now - catalogCacheAt < CATALOG_TTL_MS) {
      return { success: true, data: catalogCache };
    }

    try {
      const { items } = await fetchCatalog(authorization);
      catalogCache = { items, fetchedAt: new Date().toISOString() };
      catalogCacheAt = now;
      return { success: true, data: catalogCache };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function downloadAssets(assetUrls) {
    const results = [];
    for (const asset of assetUrls) {
      const buffer = await downloadAsset(asset.url);
      results.push({
        role: asset.role,
        url: asset.url,
        filename: asset.filename,
        mimeType: asset.mimeType || guessMimeType(asset.filename),
        data: buffer,
      });
    }
    return results;
  }

  return {
    getToken,
    setToken,
    clearToken,
    hasToken,
    getCatalog,
    downloadAssets,
    ITEM_TYPE_FOLDER,
  };
}

module.exports = { createDiscordCollectiblesService, extractCollectibleItems, urlsForItem };
