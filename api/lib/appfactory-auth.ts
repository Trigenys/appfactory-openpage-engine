import type { VercelRequest, VercelResponse } from '@vercel/node'

const ENGINE_TOKEN = process.env.APPFACTORY_ENGINE_TOKEN

export function requireAppFactoryToken(req: VercelRequest, res: VercelResponse): boolean {
  if (!ENGINE_TOKEN) {
    res.status(503).json({ error: 'APPFACTORY_ENGINE_TOKEN not configured' })
    return false
  }

  const authorization = req.headers.authorization
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''

  if (!token || token !== ENGINE_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }

  return true
}
