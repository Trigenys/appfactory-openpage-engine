import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAppFactoryToken } from './lib/appfactory-auth.js'
import {
  AppFactoryGeminiError,
  generateAppFactorySiteConfig,
} from './lib/appfactory-gemini.js'

export const config = {
  maxDuration: 60,
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
    const config = await generateAppFactorySiteConfig(prompt)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(config)
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
