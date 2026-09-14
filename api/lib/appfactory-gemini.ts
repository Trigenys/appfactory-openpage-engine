const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash']
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

function promptValue(prompt: string, label: string): string | undefined {
  const line = prompt
    .split(/\r?\n/)
    .find((entry) => entry.toLowerCase().startsWith(label.toLowerCase()))
  if (!line) return undefined
  return line.slice(label.length).trim().replace(/\.$/, '') || undefined
}

function fallbackSiteName(prompt: string): string {
  const match = prompt.match(/landing page for\s+(.+?)\./i)
  return match?.[1]?.trim() || 'Website'
}

function buildDeterministicFallback(prompt: string): unknown {
  const name = fallbackSiteName(prompt)
  const brief = promptValue(prompt, 'Business brief:') || ''
  const audience = promptValue(prompt, 'Target audience:') || ''
  const language = (promptValue(prompt, 'Language:') || 'en').toLowerCase()
  const goal = (promptValue(prompt, 'Primary conversion goal:') || '').toLowerCase()
  const isFr = language.startsWith('fr') || /fran[cç]ais/.test(language)
  const context = `${name} ${brief} ${audience}`.toLowerCase()
  const hospitality = /(h[oô]tel|hotel|boutique hotel|stay|chambre|room|hospitality|resort|h[eé]bergement)/i.test(context)
  const bookingGoal = /(booking|bookings|reservation|r[eé]servation)/i.test(goal)

  const theme = hospitality
    ? {
        bg0: '#f7f3ec', bg1: '#efe8dc', bg2: '#e5dbcc', bg3: '#d7c8b5', bg4: '#c3ad93', bg5: '#ad9275',
        text0: '#1f2924', text1: '#46544d', text2: '#6f7b74', text3: '#98a19b',
        accent: '#9b6a3d', accentDim: '#7f5430', borderDefault: '#d8cdbf', borderSubtle: '#e8e0d5', borderHover: '#c6b7a5',
        fontSans: 'DM Sans', fontDisplay: 'Sora', fontMono: 'JetBrains Mono', radius: 10, radiusLg: 18
      }
    : {
        bg0: '#ffffff', bg1: '#f7f8fa', bg2: '#eef1f4', bg3: '#e2e7eb', bg4: '#cfd7dd', bg5: '#b8c3cb',
        text0: '#172026', text1: '#3f4b53', text2: '#68757e', text3: '#95a0a7',
        accent: '#176D64', accentDim: '#12584f', borderDefault: '#dce2e6', borderSubtle: '#edf1f3', borderHover: '#c8d1d6',
        fontSans: 'Inter', fontDisplay: 'Space Grotesk', fontMono: 'JetBrains Mono', radius: 8, radiusLg: 14
      }

  const primaryCta = isFr
    ? (bookingGoal ? 'Réserver' : 'Nous contacter')
    : (bookingGoal ? 'Book now' : 'Contact us')

  const heroHeadline = hospitality
    ? (isFr ? `${name}, votre séjour pensé avec soin.` : `${name}, a stay designed with care.`)
    : (isFr ? `${name}, une expérience claire et directe.` : `${name}, a clear and focused experience.`)

  const heroSubheadline = brief || (isFr
    ? `Une présentation claire de ${name} pour vous aider à passer à l'étape suivante.`
    : `A clear introduction to ${name}, designed to help you take the next step.`)

  const featureItems = hospitality
    ? (isFr
        ? [
            { icon: 'Star', title: 'Découvrir le séjour', description: 'Explorez la proposition et l’expérience imaginées pour votre passage.' },
            { icon: 'Layers', title: 'Voir les chambres', description: 'Retrouvez les informations essentielles pour choisir votre séjour.' },
            { icon: 'Rocket', title: 'Préparer votre réservation', description: 'Passez simplement à l’étape suivante lorsque vous êtes prêt.' }
          ]
        : [
            { icon: 'Star', title: 'Discover the stay', description: 'Explore the experience designed around your visit.' },
            { icon: 'Layers', title: 'Explore the rooms', description: 'Find the essentials you need to choose your stay.' },
            { icon: 'Rocket', title: 'Plan your booking', description: 'Move to the next step when you are ready.' }
          ])
    : (isFr
        ? [
            { icon: 'Layers', title: 'Comprendre l’offre', description: 'Les éléments essentiels sont présentés de façon simple et structurée.' },
            { icon: 'Shield', title: 'Évaluer votre besoin', description: 'Identifiez rapidement ce qui correspond à votre contexte.' },
            { icon: 'Rocket', title: 'Passer à l’action', description: 'Un prochain pas clair vous permet de poursuivre sans détour.' }
          ]
        : [
            { icon: 'Layers', title: 'Understand the offer', description: 'The essentials are presented in a clear and structured way.' },
            { icon: 'Shield', title: 'Assess your needs', description: 'Quickly identify what fits your context.' },
            { icon: 'Rocket', title: 'Take the next step', description: 'A clear action helps you move forward.' }
          ])

  const audienceCopy = audience
    ? (isFr ? `Pensé en priorité pour ${audience}.` : `Designed primarily for ${audience}.`)
    : (isFr ? 'Une expérience conçue pour rester simple, lisible et utile.' : 'An experience designed to stay simple, readable and useful.')

  return {
    name,
    theme,
    blocks: [
      {
        id: 'block-navbar-1',
        type: 'navbar',
        variant: 'default',
        props: {
          logo: name,
          links: isFr ? ['Découvrir', 'Contact'] : ['Discover', 'Contact'],
          ctaText: primaryCta
        }
      },
      {
        id: 'block-hero-1',
        type: 'hero',
        variant: 'centered',
        props: {
          badge: hospitality ? (isFr ? 'Séjour premium' : 'Premium stay') : undefined,
          headline: heroHeadline,
          subheadline: heroSubheadline,
          primaryCta,
          primaryCtaUrl: '#contact',
          secondaryCta: isFr ? 'Découvrir' : 'Discover',
          secondaryCtaUrl: '#details'
        }
      },
      {
        id: 'block-features-1',
        type: 'features',
        variant: 'grid',
        props: {
          label: isFr ? 'L’essentiel' : 'Essentials',
          title: isFr ? 'Une expérience structurée autour de votre besoin.' : 'An experience structured around your needs.',
          items: featureItems
        }
      },
      {
        id: 'block-content-1',
        type: 'content',
        variant: 'highlight',
        props: { body: `## ${isFr ? 'Pensé pour vous' : 'Designed for you'}\n\n${audienceCopy}` }
      },
      {
        id: 'block-contact-1',
        type: 'contact',
        variant: 'form',
        props: {
          title: isFr ? 'Préparons la suite.' : 'Plan the next step.',
          subtitle: isFr ? 'Partagez votre besoin pour poursuivre.' : 'Share what you need to move forward.'
        }
      },
      {
        id: 'block-cta-1',
        type: 'cta',
        variant: 'simple',
        props: {
          headline: isFr ? `Prêt à avancer avec ${name} ?` : `Ready to move forward with ${name}?`,
          subheadline: isFr ? 'Passez à l’étape suivante en quelques instants.' : 'Take the next step in just a few moments.',
          buttonText: primaryCta,
          buttonUrl: '#contact'
        }
      },
      {
        id: 'block-footer-1',
        type: 'footer',
        variant: 'minimal',
        props: {
          logo: name,
          copyright: `© ${new Date().getUTCFullYear()} ${name}`,
          links: []
        }
      }
    ]
  }
}

export async function generateAppFactorySiteConfig(prompt: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const attempts: GeminiAttempt[] = []

  if (apiKey) {
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
  } else {
    attempts.push({ model: 'gemini', detail: 'GEMINI_API_KEY not configured' })
  }

  console.warn('[appfactory-generation] all Gemini attempts failed; using deterministic OpenPage SiteConfig fallback', attempts)
  return buildDeterministicFallback(prompt)
}
