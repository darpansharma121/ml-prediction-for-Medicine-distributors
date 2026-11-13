import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

import { Router } from 'express'

const router = Router()

// Get all deliveries
router.get('/', async (req: any, res: Response) => {
  try {
    const status = req.query.status as string | undefined
    const toLocationId = req.query.toLocationId as string | undefined

    let filters: any = {}
    if (status) filters.status = status
    if (toLocationId) filters.toLocationId = toLocationId

    const deliveries = await DatabaseService.prisma.delivery.findMany({
      where: filters,
      include: { fromLocation: true, toLocation: true, order: true },
      orderBy: { scheduledAt: 'desc' },
      take: 100
    })

    return res.json({ success: true, data: deliveries })
  } catch (err: any) {
    console.error('❌ GET deliveries error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

export default router