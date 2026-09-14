declare module '@/blocks/types' {
  export type BlockType =
    | 'navbar'
    | 'hero'
    | 'features'
    | 'pricing'
    | 'cta'
    | 'footer'
    | 'testimonials'
    | 'stats'
    | 'faq'
    | 'team'
    | 'contact'
    | 'newsletter'
    | 'logocloud'
    | 'divider'
    | 'banner'
    | 'content'
    | 'image'
    | 'video'
    | 'gallery'

  export type BlockVariant = string

  export interface BlockConfig {
    id: string
    type: BlockType
    variant: BlockVariant
    props: Record<string, unknown>
  }

  export interface ThemeConfig {
    bg0: string
    bg1: string
    bg2: string
    bg3: string
    bg4: string
    bg5: string
    text0: string
    text1: string
    text2: string
    text3: string
    accent: string
    accentDim: string
    borderDefault: string
    borderSubtle: string
    borderHover: string
    fontSans: string
    fontDisplay: string
    fontMono: string
    radius: number
    radiusLg: number
  }

  export interface PageConfig {
    id: string
    name: string
    path: string
    blocks: BlockConfig[]
  }

  export interface SiteConfig {
    name: string
    pages?: PageConfig[]
    blocks: BlockConfig[]
    theme?: Partial<ThemeConfig>
  }
}

declare module '@/lib/theme-presets' {
  import type { ThemeConfig } from '@/blocks/types'
  export function resolveTheme(partial?: Partial<ThemeConfig>): ThemeConfig
}
