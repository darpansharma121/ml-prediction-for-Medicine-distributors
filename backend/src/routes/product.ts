import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

import { Router } from 'express'

const router = Router()

// Product Schema
const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(2),
  category: z.enum(['TABLETS', 'CAPSULES', 'SYRUPS', 'SUSPENSIONS']),
  dosageForm: z.string().min(2),
  unitOfMeasurement: z.string().min(1),
  shelfLifeDays: z.number().int().positive(),
  minimumStockThreshold: z.number().int().nonnegative(),
  baseDemand: z.number().nonnegative()
})

// Get all products with pagination and search
router.get('/', async (req: any, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const search = req.query.search as string | undefined
    const category = req.query.category as string | undefined
    const status = req.query.status as string | undefined

    const [products, total] = await Promise.all([
      DatabaseService.findAllProducts(),
      DatabaseService.prisma.product.count()
    ])

    // Filter by pagination
    let filteredProducts = products
    if (search) {
      filteredProducts = filteredProducts.filter(p =>
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    }

    return res.json({
      success: true,
      data: {
        products: filteredProducts,
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
    console.error('❌ GET products error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Search products
router.get('/:id', async (req: any, res: Response) => {
  try {
    const product = await DatabaseService.prisma.product.findUnique({
      where: { id: req.params.id }
    })

    if (!product) {
      return res.status(404).json({
        success: false,
        error: { code: 'RECORD_NOT_FOUND', message: 'Product not found' }
      })
    }

    return res.json({ success: true, data: product })
  } catch (err: any) {
    console.error('❌ Get product error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Create product
router.post('/', async (req: any, res: Response) => {
  try {
    const parsedData = productSchema.parse(req.body)

    // Check for duplicate SKU
    const existingProduct = await DatabaseService.prisma.product.findUnique({
      where: { sku: parsedData.sku }
    })
    if (existingProduct) {
      return res.status(409).json({
        success: false,
        error: { code: 'SKU_EXISTS', message: 'Product SKU already exists' }
      })
    }

    const product = await DatabaseService.createProduct(parsedData)

    return res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    })
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' }
      })
    }
    console.error('❌ POST product error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'CREATION_ERROR', message: err.message }
    })
  }
})

// Update product
router.put('/:id', async (req: any, res: Response) => {
  try {
    const updates = req.body
    const product = await DatabaseService.prisma.product.update({
      where: { id: req.params.id },
      data: updates
    })

    return res.json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    })
  } catch (err: any) {
    if (err.code === 'P2023') {
      return res.status(404).json({
        success: false,
        error: { code: 'RECORD_NOT_FOUND', message: 'Product not found' }
      })
    }
    console.error('❌ PUT product error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: err.message }
    })
  }
})

export default router