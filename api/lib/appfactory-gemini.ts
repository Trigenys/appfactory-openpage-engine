const DEFAULT_MODELS = ['gemini-3.6-flash']
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const REQUEST_TIMEOUT_MS = 30_000

const systemPrompt = `You generate production-quality OpenPage SiteConfig JSON for a website builder.

Return ONLY valid JSON, with this shape:
{
  "name": "Site name",
  "theme": {
    "bg0":"#hex","bg1":"#hex","bg2":"#hex","bg3":"#hex","bg4":"#hex","bg5":"#hex",
    "text0":"#hex","text1":"#hex","text2":"#hex","text3":"#hex",
    "accent":"#hex","accentDim":"#hex","borderDefault":"#hex","borderSubtle":"#hex","borderHover":"#hex",
    "fontSans":"Inter","fontDisplay":"Inter","fontMono":"JetBrains Mono","radius":8,"radiusLg":12
  },
  "blocks": [
    {"id":"block-navbar-1","type":"navbar","variant":"default","props":{}},
    {"id":"block-hero-1","type":"hero","variant":"centered","props":{}},
    {"id":"block-features-1","type":"features","variant":"grid","props":{}},
    {"id":"block-content-1","type":"content","variant":"prose","props":{}},
    {"id":"block-cta-1","type":"cta","variant":"simple","props":{}},
    {"id":"block-footer-1","type":"footer","variant":"simple","props":{}}
  ]
}

Allowed block types and variants:
- navbar: default, centered. Props: logo, links[], ctaText
- hero: centered, split, gradient, minimal. Props: badge?, headline, subheadline, primaryCta, primaryCtaUrl?, secondaryCta?, secondaryCtaUrl?, heroImage?
- features: grid, list, alternating. Props: label?, title, subtitle?, items[{icon?,title,description}]
- content: prose, columns, highlight. Props: body
- image: hero-image, side-by-side, grid. Props: src?, alt?, title?, subtitle?, images?, imageSide?
- gallery: grid, masonry. Props: title?, images?
- faq: accordion. Props: title?, items[{question,answer}]
- contact: form. Props: title?, subtitle?
- cta: simple, split. Props: headline, subheadline?, buttonText, buttonUrl?
- footer: simple, multi-column, minimal. Props: logo, copyright, links[]
- divider: line, space, dots
- banner: ribbon, bar
- newsletter: simple
- team: grid
- pricing: simple, comparison
- testimonials: cards, carousel, spotlight
- stats: grid, bar, counter
- logocloud: default
- video: youtube, vimeo

Rules:
1. Include a navbar, hero, at least two useful business-specific content sections, a CTA or contact section, and a footer.
2. Generate 5-8 blocks total.
3. Copy must match the requested language and business. Never mention OpenPage, AppFactory, AI, templates or generation tooling.
4. Do not invent testimonials, client logos, metrics, awards, certifications, prices, people, addresses, phone numbers or emails unless explicitly supplied by the user.
5. Do not include pricing, testimonials, stats or logocloud unless the prompt explicitly provides the corresponding factual data.
6. Choose a distinctive theme appropriate to the business rather than defaulting every site to a dark tech style.
7. Use only http(s), mailto, tel, relative paths or # anchors for URLs. Never emit javascript: or data:text/html URLs.
8. Use unique deterministic block IDs such as block-hero-1, block-features-1.
9. Return JSON only; no markdown fences and no explanation.`

interface GeminiAttempt {
  model: string
  status?: number
  detail: string
}

export class AppFactoryGeminiError extends Error {
  constructor(readonly attempts: GeminiAttempt[]) {
    super('All Gemini generation attempts failed')
  }
}

function modelCandidates(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim()
  return [...new Set([configured, ...DEFAULT_MODELS].filter((value): value is string => Boolean(value)))]
}

function extractText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const candidates = (data as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  const first = candidates[0]
  if (!first || typeof first !== 'object') return null
  const content = (first as { content?: unknown }).content
  if (!content || typeof content !== 'object') return null
  const parts = (content as { parts?: unknown }).parts
  if (!Array.isArray(parts)) return null
  for (const part of parts) {
    if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
      return (part as { text: string }).text
    }
  }
  return null
}

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    return JSON.parse(withoutFence)
  }
}

export async function generateAppFactorySiteConfig(prompt: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const attempts: GeminiAttempt[] = []

  for (const model of modelCandidates()) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.65
          }
        })
      })

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1200)
        attempts.push({ model, status: response.status, detail })
        console.error(`[appfactory-gemini] ${model} returned ${response.status}: ${detail}`)
        continue
      }

      const data = await response.json()
      const text = extractText(data)
      if (!text) {
        attempts.push({ model, detail: 'Gemini returned no text candidate.' })
        console.error(`[appfactory-gemini] ${model} returned no text candidate`)
        continue
      }

      try {
        return parseJson(text)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        attempts.push({ model, detail: `Invalid JSON: ${detail}` })
        console.error(`[appfactory-gemini] ${model} returned invalid JSON: ${detail}`)
      }
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      attempts.push({ model, detail })
      console.error(`[appfactory-gemini] ${model} request failed: ${detail}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new AppFactoryGeminiError(attempts)
}
