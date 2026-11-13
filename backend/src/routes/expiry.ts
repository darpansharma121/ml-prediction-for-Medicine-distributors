import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

import { Router } from 'express'

const router = Router()

// Get all expiry alerts
router.get('/', async (req: any, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const severity = req.query.severity as string | undefined

    let filters: any = {}
    if (days) {
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() + days)
      filters = {
        expiresAt: { lte: fromDate, gte: new Date(), status: 'ACTIVE' }
      }
    } else if (severity) {
      filters.status = severity === 'CRITICAL' ? 'CRITICAL' : 'ACTIVE'
    }

    // Find batches with expiring/expired status
    const batches = await DatabaseService.prisma.batch.findMany({
      where: filters,
      include: {
        product: true,
        location: true,
        inventory: { where: { status: { not: 'EXPIRED' } }, take: 1 }
      },
      orderBy: { expiresAt: 'asc' }
    })

    return res.json({ success: true, data: batches })
  } catch (err: any) {
    console.error('❌ GET expiry error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Get batch detail by ID
router.get('/batch/:id', async (req: any, res: Response) => {
  try {
    const batch = await DatabaseService.prisma.batch.findUnique({
      where: { id: req.params.id },
      include: {
        product: true,
        location: true,
        inventory: true
      }
    })

    if (!batch) {
      return res.status(404).json({ success: false, error: { code: 'RECORD_NOT_FOUND', message: 'Batch not found' } })
    }

    return res.json({ success: true, data: batch })
  } catch (err: any) {
    console.error('❌ GET expiry batch error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

export default router