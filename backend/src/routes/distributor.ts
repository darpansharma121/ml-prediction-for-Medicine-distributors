import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

import { Router } from 'express'

const router = Router()

const distributorSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).regex(/^[A-Z0-9-]+$/),
  locationId: z.string().min(1),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  email: z.string().email().optional()
})

// Get all distributors
router.get('/', async (req: any, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const skip = (page - 1) * limit
    const search = req.query.search as string | undefined
    const locationId = req.query.locationId as string | undefined

    let filters: any = {}
    if (search) {
      filters.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } }
      ]
    }
    if (locationId) {
      filters.locationId = locationId
    }

    const [distributors, total] = await Promise.all([
      DatabaseService.prisma.distributor.findMany({
        skip,
        take: limit,
        where: filters,
        include: {
          location: true,
          _count: { select: { inventory: true, orders: true, deliveries: true, sales: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      DatabaseService.prisma.distributor.count({ where: filters })
    ])

    return res.json({
      success: true,
      data: {
        distributors,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: total > skip + limit
        }
      }
    })
  } catch (err: any) {
    console.error('❌ GET distributors error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Get distributor by ID
router.get('/:id', async (req: any, res: Response) => {
  try {
    const distributor = await DatabaseService.prisma.distributor.findUnique({
      where: { id: req.params.id },
      include: {
        location: true,
        inventory: true,
        orders: { orderBy: { orderDate: 'desc' }, include: { items: true } },
        deliveries: { orderBy: { scheduledAt: 'desc' }, take: 20 },
        sales: { orderBy: { saleDate: 'desc' }, take: 50 }
      }
    })

    if (!distributor) {
      return res.status(404).json({
        success: false,
        error: { code: 'RECORD_NOT_FOUND', message: 'Distributor not found' }
      })
    }

    return res.json({ success: true, data: distributor })
  } catch (err: any) {
    console.error('❌ GET distributor error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Create distributor
router.post('/', async (req: any, res: Response) => {
  try {
    const data = distributorSchema.parse(req.body)

    const distributor = await DatabaseService.createDistributor({ ...data })

    return res.status(201).json({
      success: true,
      data: distributor,
      message: 'Distributor created successfully'
    })
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' }
      })
    }
    console.error('❌ POST distributor error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'CREATION_ERROR', message: err.message }
    })
  }
})

export default router