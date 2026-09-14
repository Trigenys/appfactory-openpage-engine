interface SiteBlock {
  id?: string
  type?: string
  variant?: string
  props?: Record<string, unknown>
}

interface SiteConfigLike extends Record<string, unknown> {
  name?: string
  blocks?: SiteBlock[]
}

interface PexelsPhoto {
  id?: number
  alt?: string
  photographer?: string
  src?: {
    medium?: string
    large?: string
    landscape?: string
  }
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[]
}

function promptValue(prompt: string, label: string): string | undefined {
  const line = prompt
    .split(/\r?\n/)
    .find((entry) => entry.toLowerCase().startsWith(label.toLowerCase()))
  if (!line) return undefined
  return line.slice(label.length).trim().replace(/\.$/, '') || undefined
}

function isFrench(prompt: string): boolean {
  const language = (promptValue(prompt, 'Language:') || '').toLowerCase()
  return language.startsWith('fr') || language.includes('french') || language.includes('français')
}

function promptContext(prompt: string): string {
  return `${promptValue(prompt, 'Business brief:') || ''} ${promptValue(prompt, 'Target audience:') || ''} ${promptValue(prompt, 'Design recipe:') || ''}`.toLowerCase()
}

function isSoftwareProduct(prompt: string): boolean {
  const context = promptContext(prompt)
  return /(software|saas|startup|technology|technologie|tech|digital|numérique|application|appli|logiciel|windows|winget|desktop|pc\b|assistant windows)/i.test(context)
}

function pexelsQuery(prompt: string): string {
  const context = promptContext(prompt)

  if (/(h[oô]tel|hotel|boutique hotel|resort|chambre|room|stay|hospitality|h[eé]bergement)/i.test(context)) {
    return 'luxury boutique hotel interior room travel'
  }
  if (/(avocat|law firm|legal|juridique|cabinet d['’]avocats)/i.test(context)) {
    return 'modern law office business meeting'
  }
  if (/(immobilier|real estate|property|architecture)/i.test(context)) {
    return 'modern luxury property architecture interior'
  }
  if (/(restaurant|food|cuisine|cafe|café)/i.test(context)) {
    return 'premium restaurant interior dining food'
  }
  if (/(ecommerce|e-commerce|boutique|retail|commerce|shop)/i.test(context)) {
    return 'premium retail products shopping lifestyle'
  }
  if (/(sant[eé]|health|medical|clinic|clinique|wellness)/i.test(context)) {
    return 'modern healthcare wellness clinic'
  }
  if (/(education|éducation|school|école|academy|formation|learning)/i.test(context)) {
    return 'modern education learning students classroom'
  }
  if (/(logistics|logistique|transport|fleet|warehouse|shipping)/i.test(context)) {
    return 'modern logistics warehouse transport business'
  }
  if (/(creative|design|agency|agence|studio|portfolio)/i.test(context)) {
    return 'creative design studio modern workspace'
  }

  return 'premium business lifestyle modern interior'
}

function photoUrl(photo: PexelsPhoto): string {
  return photo.src?.landscape || photo.src?.large || photo.src?.medium || ''
}

async function searchPexels(prompt: string): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY?.trim()
  if (!apiKey) return []

  const params = new URLSearchParams({
    query: pexelsQuery(prompt),
    per_page: '6',
    orientation: 'landscape'
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)

  try {
    const response = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: apiKey },
      signal: controller.signal
    })

    if (!response.ok) {
      console.warn(`[appfactory-pexels] search returned ${response.status}`)
      return []
    }

    const data = (await response.json()) as PexelsSearchResponse
    return (Array.isArray(data.photos) ? data.photos : []).filter((photo) => Boolean(photoUrl(photo)))
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.warn(`[appfactory-pexels] search failed: ${detail}`)
    return []
  } finally {
    clearTimeout(timeout)
  }
}

export async function enrichSiteConfigWithPexels(rawConfig: unknown, prompt: string): Promise<unknown> {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) return rawConfig

  const config = rawConfig as SiteConfigLike
  if (!Array.isArray(config.blocks)) return rawConfig

  if (isSoftwareProduct(prompt)) {
    console.info('[appfactory-pexels] skipping stock-photo enrichment for software/SaaS product')
    return rawConfig
  }

  const photos = await searchPexels(prompt)
  if (photos.length === 0) return rawConfig

  const blocks: SiteBlock[] = config.blocks.map((block): SiteBlock => ({
    ...block,
    props: { ...(block.props || {}) }
  }))

  const hero = blocks.find((block) => block.type === 'hero')
  if (hero) {
    const heroProps = hero.props || {}
    if (!heroProps.heroImage) {
      hero.props = {
        ...heroProps,
        heroImage: photoUrl(photos[0])
      }
      if (!hero.variant || ['centered', 'gradient', 'minimal'].includes(hero.variant)) {
        hero.variant = 'split'
      }
    }
  }

  const alreadyHasMediaSection = blocks.some((block) => block.type === 'gallery' || block.type === 'image')
  if (!alreadyHasMediaSection && photos.length >= 4) {
    const french = isFrench(prompt)
    const gallery: SiteBlock = {
      id: 'block-gallery-1',
      type: 'gallery',
      variant: 'grid',
      props: {
        title: french ? 'L’expérience en images' : 'The experience in pictures',
        images: photos.slice(1, 6).map((photo) => ({
          src: photoUrl(photo),
          alt: photo.alt || (french ? 'Image de présentation' : 'Presentation image')
        }))
      }
    }

    const insertBefore = blocks.findIndex((block) => ['contact', 'cta', 'footer'].includes(block.type || ''))
    if (insertBefore >= 0) blocks.splice(insertBefore, 0, gallery)
    else blocks.push(gallery)
  }

  console.info(`[appfactory-pexels] enriched site with ${Math.min(photos.length, 6)} photo candidates`)
  return { ...config, blocks }
}
