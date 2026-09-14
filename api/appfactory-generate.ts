import type { VercelRequest, VercelResponse } from '@vercel/node'
import generateHandler from './generate'
import { requireAppFactoryToken } from './lib/appfactory-auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAppFactoryToken(req, res)) return
  return generateHandler(req, res)
}
