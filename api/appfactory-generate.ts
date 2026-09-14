import type { VercelRequest, VercelResponse } from '@vercel/node'
import generateHandler from './generate.js'
import { requireAppFactoryToken } from './lib/appfactory-auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAppFactoryToken(req, res)) return
  return generateHandler(req, res)
}
