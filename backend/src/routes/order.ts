import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

const router = require('express').Router()

const orderSchema = z.object({
  distributorId: z.string().min(1),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative()
  })),
  expectedDelivery: z.date().optional(),
  totalAmount: z.number().nonnegative()
})

// Get orders by distributor
router.get('/', async (req: any, res: Response) => {
  try {
    const distributorId = req.query.distributorId as string | undefined

    let filters: any = {}
    if (distributorId) filters.distributorId = distributorId

    const orders = await DatabaseService.prisma.order.findMany({
      where: filters,
      include: { items: true, distributor: true },
      orderBy: { orderDate: 'desc' },
      take: 50
    })

    return res.json({ success: true, data: orders })
  } catch (err: any) {
    console.error('❌ GET orders error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Create order
router.post('/', async (req: any, res: Response) => {
  try {
    const data = orderSchema.parse(req.body)

    if (!data.items || data.items.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Order must have at least one item' } })
    }

    const totalAmount = data.totalAmount || data.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0)

    const order = await DatabaseService.createOrder({
      ...data,
      totalAmount: totalAmount.toFixed(2)
    })

    return res.status(201).json({ success: true, data: order, message: 'Order created successfully' })
  } catch (err: any) {
    console.error('❌ POST order error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'CREATION_ERROR', message: err.message }
    })
  }
})

export default router