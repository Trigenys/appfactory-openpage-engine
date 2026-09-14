import { describe, expect, it } from 'vitest'
import { normalizeGeneratedSiteConfig } from '../api/lib/appfactory-export-normalize'

describe('normalizeGeneratedSiteConfig', () => {
  it('normalizes recoverable model-generated prop type drift', () => {
    const normalized = normalizeGeneratedSiteConfig({
      name: 'AgenStart',
      theme: {
        fontSans: 'Inter',
        fontDisplay: { family: 'Space Grotesk' },
        radius: 12,
      },
      blocks: [
        {
          id: 'navbar-1',
          type: 'navbar',
          variant: 'default',
          props: {
            logo: 'AgenStart',
            links: [
              { label: 'Fonctionnalités', href: '#features' },
              { text: 'Télécharger', url: '#download' },
            ],
            ctaText: 42,
          },
        },
        {
          id: 'features-1',
          type: 'features',
          variant: 'grid',
          props: {
            title: 'Tout pour préparer votre PC',
            items: [
              {
                icon: 'Layers',
                title: 123,
                description: true,
              },
            ],
          },
        },
      ],
    }) as any

    expect(normalized.blocks[0].props.links).toEqual(['Fonctionnalités', 'Télécharger'])
    expect(normalized.blocks[0].props.ctaText).toBe('42')
    expect(normalized.blocks[1].props.items[0].title).toBe('123')
    expect(normalized.blocks[1].props.items[0].description).toBe('true')
    expect(normalized.theme.fontSans).toBe('Inter')
    expect(normalized.theme.fontDisplay).toBeUndefined()
    expect(normalized.theme.radius).toBe(12)
  })
})
