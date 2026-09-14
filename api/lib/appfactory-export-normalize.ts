type UnknownRecord = Record<string, unknown>

const TEXT_KEYS = new Set([
  'logo', 'logoImage', 'ctaText',
  'badge', 'headline', 'subheadline', 'primaryCta', 'primaryCtaUrl', 'secondaryCta', 'secondaryCtaUrl', 'heroImage',
  'label', 'title', 'subtitle', 'body',
  'icon', 'description', 'name', 'role', 'quote', 'avatar', 'company',
  'value', 'question', 'answer',
  'buttonText', 'buttonUrl',
  'copyright', 'src', 'alt', 'imageSide',
  'url', 'href', 'text',
  'price', 'period', 'videoId', 'provider'
])

const THEME_TEXT_KEYS = new Set([
  'bg0', 'bg1', 'bg2', 'bg3', 'bg4', 'bg5',
  'text0', 'text1', 'text2', 'text3',
  'accent', 'accentDim', 'borderDefault', 'borderSubtle', 'borderHover',
  'fontSans', 'fontDisplay', 'fontMono'
])

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function objectLabel(value: unknown): string | undefined {
  const direct = scalarText(value)
  if (direct !== undefined) return direct
  if (!isObject(value)) return undefined

  for (const key of ['label', 'text', 'title', 'name']) {
    const candidate = scalarText(value[key])
    if (candidate !== undefined && candidate.trim()) return candidate
  }

  return undefined
}

function normalizeLinks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(objectLabel)
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

function normalizeRecord(record: UnknownRecord): UnknownRecord {
  const normalized: UnknownRecord = {}

  for (const [key, value] of Object.entries(record)) {
    if (key === 'links') {
      normalized[key] = normalizeLinks(value)
      continue
    }

    if (TEXT_KEYS.has(key)) {
      const text = scalarText(value)
      normalized[key] = text ?? ''
      continue
    }

    if (Array.isArray(value)) {
      normalized[key] = value.map((entry) => (isObject(entry) ? normalizeRecord(entry) : entry))
      continue
    }

    if (isObject(value)) {
      normalized[key] = normalizeRecord(value)
      continue
    }

    normalized[key] = value
  }

  return normalized
}

function normalizeBlock(value: unknown): unknown {
  if (!isObject(value)) return value
  const normalized = { ...value }
  if (isObject(value.props)) normalized.props = normalizeRecord(value.props)
  return normalized
}

function normalizeTheme(value: unknown): unknown {
  if (!isObject(value)) return value
  const theme: UnknownRecord = {}

  for (const [key, entry] of Object.entries(value)) {
    if (THEME_TEXT_KEYS.has(key)) {
      if (typeof entry === 'string' && entry.trim()) theme[key] = entry
      continue
    }

    if (key === 'radius' || key === 'radiusLg') {
      if (typeof entry === 'number' && Number.isFinite(entry)) theme[key] = entry
      continue
    }

    theme[key] = entry
  }

  return theme
}

export function normalizeGeneratedSiteConfig(value: unknown): unknown {
  if (!isObject(value)) return value

  const normalized: UnknownRecord = { ...value }

  if (Array.isArray(value.blocks)) {
    normalized.blocks = value.blocks.map(normalizeBlock)
  }

  if (Array.isArray(value.pages)) {
    normalized.pages = value.pages.map((page) => {
      if (!isObject(page)) return page
      return {
        ...page,
        ...(Array.isArray(page.blocks) ? { blocks: page.blocks.map(normalizeBlock) } : {})
      }
    })
  }

  if (value.theme !== undefined) {
    normalized.theme = normalizeTheme(value.theme)
  }

  return normalized
}
