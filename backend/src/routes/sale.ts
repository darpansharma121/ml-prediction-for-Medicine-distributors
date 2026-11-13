import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

import { Router } from 'express'

const router = Router()

const saleSchema = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  distributorId: z.string().optional(),
  quantity: z.number().int().positive(),
  revenue: z.number().nonnegative()
})

// Get all sales with filters
router.get('/', async (req: any, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const skip = (page - 1) * limit
    const search = req.query.search as string | undefined
    const locationId = req.query.locationId as string | undefined
    const productId = req.query.productId as string | undefined

    let filters: any = {}
    if (search) filters.OR = [
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { product: { sku: { contains: search, mode: 'insensitive' } } },
      { location: { name: { contains: search, mode: 'insensitive' } } }
    ]
    if (locationId) filters.locationId = locationId
    if (productId) filters.productId = productId

    const [sales, total] = await Promise.all([
      DatabaseService.prisma.sale.findMany({
        skip, take: limit, where: filters,
        include: { product: true, location: true, distributor: true },
        orderBy: { saleDate: 'desc' }
      }),
      DatabaseService.prisma.sale.count({ where: filters })
    ])

    return res.json({
      success: true,
      data: { sales, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    })
  } catch (err: any) {
    console.error('❌ GET sales error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Create sale
router.post('/', async (req: any, res: Response) => {
  try {
    const data = saleSchema.parse(req.body)

    const sale = await DatabaseService.createSale(data)

    // Update inventory
    await DatabaseService.prisma.inventory.update({
      where: {
        locationId_productId_distributorId: {
          locationId: data.locationId,
          productId: data.productId,
          distributorId: data.distributorId
        }
      },
      data: { quantity: { decrement: data.quantity } }
    })

    // Create transaction
    await DatabaseService.prisma.inventoryTransaction.create({
      data: {
        inventoryId: (await DatabaseService.prisma.inventory.findUnique({
          where: { locationId_productId_distributorId: { locationId: data.locationId, productId: data.productId, distributorId: data.distributorId || '' } }
        }))?.id,
        type: 'SALE',
        quantity: data.quantity,
        notes: `Sales record`,
        reference: `SALE-${Date.now()}`
      }
    })

    return res.status(201).json({
      success: true, data: sale, message: 'Sale created successfully'
    })
  } catch (err: any) {
    console.error('❌ POST sale error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'CREATION_ERROR', message: err.message }
    })
  }
})

export default router