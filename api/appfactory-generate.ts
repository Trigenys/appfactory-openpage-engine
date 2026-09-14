import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAppFactoryToken } from './lib/appfactory-auth.js'
import {
  AppFactoryGeminiError,
  generateAppFactorySiteConfig,
} from './lib/appfactory-gemini.js'
import { enrichSiteConfigWithPexels } from './lib/appfactory-pexels.js'

export const config = {
  maxDuration: 60,
}

// Prefer the newest stable Flash model when no explicit override is configured.
// appfactory-gemini.ts already keeps gemini-3.6-flash as its fallback candidate,
// so the effective default chain is: 3.8 Flash -> 3.6 Flash.
if (!process.env.GEMINI_MODEL?.trim()) {
  process.env.GEMINI_MODEL = 'gemini-3.8-flash'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!requireAppFactoryToken(req, res)) return

  const prompt = req.body?.prompt
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt is required' })
  }

  try {
    const generatedConfig = await generateAppFactorySiteConfig(prompt)
    const configWithMedia = await enrichSiteConfigWithPexels(generatedConfig, prompt)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(configWithMedia)
  } catch (error) {
    if (error instanceof AppFactoryGeminiError) {
      return res.status(502).json({
        error: 'Gemini generation failed',
        attempts: error.attempts.map((attempt) => ({
          model: attempt.model,
          status: attempt.status,
          detail: attempt.detail.slice(0, 500),
        })),
      })
    }

    return res.status(500).json({
      error: 'Generation failed',
      details: error instanceof Error ? error.message : String(error),
    })
  }
}
