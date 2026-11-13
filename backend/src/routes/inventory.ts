import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

import { Router } from 'express'

const router = Router()

const inventorySchema = z.object({
  locationId: z.string().min(1),
  productId: z.string().min(1),
  distributorId: z.string().min(1),
  quantity: z.number().int(),
  incomingQuantity: z.number().int().nonnegative(),
  reorderPoint: z.number().int().nonnegative(),
  status: z.enum(['HEALTHY', 'LOW_STOCK', 'CRITICAL', 'EXCESS'])
})

// Get all inventory with filters
router.get('/', async (req: any, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const skip = (page - 1) * limit
    const search = req.query.search as string | undefined
    const locationId = req.query.locationId as string | undefined
    const productId = req.query.productId as string | undefined
    const distributorId = req.query.distributorId as string | undefined
    const status = req.query.status as string | undefined
    const district = req.query.district as string | undefined

    let filters: any = {}
    if (search) {
      filters.OR = [
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { 'product.sku': { contains: search, mode: 'insensitive' } }
      ]
    }
    if (locationId) filters.locationId = locationId
    if (productId) filters.productId = productId
    if (distributorId) filters.distributorId = distributorId
    if (status) filters.status = status
    if (district) {
      filters.location = { district }
    }

    const [inventory, total] = await Promise.all([
      DatabaseService.prisma.inventory.findMany({
        skip,
        take: limit,
        where: filters,
        include: {
          location: true,
          product: true,
          distributor: true,
          batch: true
        },
        orderBy: { lastUpdated: 'desc' }
      }),
      DatabaseService.prisma.inventory.count({ where: filters })
    ])

    return res.json({
      success: true,
      data: {
        inventory,
        pagination: {
          page, limit, total,
          totalPages: Math.ceil(total / limit),
          hasMore: total > skip + limit
        }
      }
    })
  } catch (err: any) {
    console.error('❌ GET inventory error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Get inventory detail by ID
router.get('/:id', async (req: any, res: Response) => {
  try {
    const inventory = await DatabaseService.prisma.inventory.findUnique({
      where: { id: req.params.id },
      include: {
        location: true,
        product: true,
        distributor: true,
        transactions: {
          orderBy: { transactionDate: 'desc' },
          take: 20
        },
        batches: {
          include: { location: true }
        }
      }
    })

    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: { code: 'RECORD_NOT_FOUND', message: 'Inventory record not found' }
      })
    }

    return res.json({ success: true, data: inventory })
  } catch (err: any) {
    console.error('❌ GET inventory detail error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Create inventory record
router.post('/', async (req: any, res: Response) => {
  try {
    const data = inventorySchema.parse(req.body)

    const inventory = await DatabaseService.createInventory(data)

    // Create transaction record
    await DatabaseService.prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventory.id,
        type: 'RECEIPT',
        quantity: data.quantity,
        notes: `Initial stock creation`
      }
    })

    return res.status(201).json({
      success: true,
      data: inventory,
      message: 'Inventory record created successfully'
    })
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' }
      })
    }
    console.error('❌ POST inventory error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'CREATION_ERROR', message: err.message }
    })
  }
})

// Update inventory quantity
router.put('/:id', async (req: any, res: Response) => {
  try {
    const updates = req.body
    const inventory = await DatabaseService.prisma.inventory.update({
      where: { id: req.params.id },
      data: updates,
      include: {
        location: true,
        product: true,
        distributor: true
      }
    })

    // Update status based on quantity vs reorder point
    if (updates.reorderPoint && updates.reorderPoint < updates.quantity) {
      inventory.status = 'LOW_STOCK'
    } else if (updates.reorderPoint && updates.reorderPoint > updates.quantity) {
      inventory.status = 'HEALTHY'
    }

    return res.json({
      success: true,
      data: inventory,
      message: 'Inventory updated successfully'
    })
  } catch (err: any) {
    if (err.code === 'P2023') {
      return res.status(404).json({
        success: false,
        error: { code: 'RECORD_NOT_FOUND', message: 'Inventory record not found' }
      })
    }
    console.error('❌ PUT inventory error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: err.message }
    })
  }
})

// Get inventory movement history
router.get('/:id/history', async (req: any, res: Response) => {
  try {
    const transactions = await DatabaseService.prisma.inventoryTransaction.findMany({
      where: { inventoryId: req.params.id },
      orderBy: { transactionDate: 'desc' }
    })

    return res.json({ success: true, data: transactions })
  } catch (err: any) {
    console.error('❌ GET inventory history error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

export default router