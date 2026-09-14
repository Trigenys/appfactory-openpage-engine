import type { VercelRequest, VercelResponse } from '@vercel/node'
import { register } from 'node:module'
import type { SiteConfig } from '../src/blocks/types.js'
import '../src/lib/theme-presets.js'
import { requireAppFactoryToken } from './lib/appfactory-auth.js'

register(new URL('./lib/appfactory-alias-loader.mjs', import.meta.url), import.meta.url)

const exporterPromise = import('../src/lib/export-html.js')

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validSiteConfig(value: unknown): value is SiteConfig {
  if (!isObject(value)) return false
  const hasBlocks = Array.isArray(value.blocks) && value.blocks.length > 0
  const hasPages = Array.isArray(value.pages) && value.pages.length > 0
  return typeof value.name === 'string' && value.name.trim().length > 0 && (hasBlocks || hasPages)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireAppFactoryToken(req, res)) return

  const body = isObject(req.body) ? req.body : {}
  const config = body.config

  if (!validSiteConfig(config)) {
    return res.status(400).json({ error: 'config must be a valid OpenPage SiteConfig' })
  }

  if (JSON.stringify(config).length > 1_000_000) {
    return res.status(413).json({ error: 'SiteConfig is too large to export' })
  }

  const rawSettings = isObject(body.settings) ? body.settings : {}

  try {
    const { exportSiteToHTML } = await exporterPromise
    const settings = {
      siteName: typeof rawSettings.siteName === 'string' ? rawSettings.siteName : config.name,
      siteDescription: typeof rawSettings.siteDescription === 'string' ? rawSettings.siteDescription : undefined,
      language: typeof rawSettings.language === 'string' ? rawSettings.language : undefined,
      seoTitle: typeof rawSettings.seoTitle === 'string' ? rawSettings.seoTitle : undefined,
      seoDescription: typeof rawSettings.seoDescription === 'string' ? rawSettings.seoDescription : undefined,
      faviconUrl: typeof rawSettings.faviconUrl === 'string' ? rawSettings.faviconUrl : undefined,
      ogImageUrl: typeof rawSettings.ogImageUrl === 'string' ? rawSettings.ogImageUrl : undefined
    }

    const html = exportSiteToHTML(config, { settings })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(html)
  } catch (error) {
    console.error('[appfactory-export] export failed', error)
    return res.status(500).json({
      error: 'Export failed',
      details: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    })
  }
}
