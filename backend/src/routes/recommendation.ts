import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

const router = require('express').Router()

const generateSchema = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  predictedDemand: z.number().int(),
  currentInventory: z.number().int(),
  reorderPoint: z.number().int(),
  incomingStock: z.number().int(),
  horizon: z.number().int().positive()
})

// Get all recommendations
router.get('/', async (req: any, res: Response) => {
  try {
    const status = req.query.status as string | undefined
    let filters: any = {}
    if (status) filters.status = status

    const recommendations = await DatabaseService.prisma.recommendation.findMany({
      where: filters,
      include: { product: true, location: true },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    return res.json({ success: true, data: recommendations })
  } catch (err: any) {
    console.error('❌ GET recommendations error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Generate recommendation
router.post('/generate', async (req: any, res: Response) => {
  try {
    const data = generateSchema.parse(req.body)

    // Calculate recommended quantity
    const inventoryPosition = data.currentInventory + data.incomingStock
    const targetStock = data.reorderPoint * 3 // Target is 3x reorder point
    const recommendedQty = Math.max(0, targetStock - inventoryPosition)

    // Determine priority
    let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    if (data.currentInventory <= data.reorderPoint) {
      priority = 'CRITICAL'
    } else if (recommendedQty < 50) {
      priority = 'HIGH'
    } else if (recommendedQty < 100) {
      priority = 'MEDIUM'
    } else {
      priority = 'LOW'
    }

    // Create explanation
    const explanation = `Current inventory ${data.currentInventory}, projected demand ${data.predictedDemand} over horizon ${data.horizon} days. ` +
      `Reorder point set at ${data.reorderPoint}. ` +
      `Replenishment needed for ${recommendedQty} units to reach safety stock level of ${targetStock}.`

    // Try transfer optimization
    const transferSuggestion = await checkTransferFeasibility(data.productId, data.locationId, data.predictedDemand, data.horizon)

    const recommendation = await DatabaseService.createRecommendation({
      type: 'REPLENISHMENT',
      priority,
      status: 'PENDING',
      productId: data.productId,
      locationId: data.locationId,
      currentInventory: data.currentInventory,
      predictedDemand: data.predictedDemand,
      reorderPoint: data.reorderPoint,
      incomingStock: data.incomingStock,
      recommendedQty,
      explanation
    })

    // If transfer feasible and it would be cheaper, create a transfer recommendation
    if (transferSuggestion.needsTransfer && transferSuggestion.destinationProductAvailable) {
      await DatabaseService.prisma.inventoryTransfer.create({
        data: {
          sourceLocationId: data.locationId,
          targetLocationId: transferSuggestion.fromLocationId,
          productId: data.productId,
          quantity: transferSuggestion.quantity,
          status: 'PENDING',
          notes: `Auto-generated transfer recommendation based on surplus inventory analysis`
        }
      })

      await DatabaseService.prisma.recommendation.update({
        where: { id: recommendation.id },
        data: {
          type: 'TRANSFER',
          priority: 'HIGH',
          explanation: `Transfer suggested as cost-effective alternative to direct replenishment: ${explanation}`
        }
      })
    }

    return res.status(201).json({
      success: true,
      data: recommendation,
      message: 'Recommendation generated successfully'
    })
  } catch (err: any) {
    console.error('❌ POST recommendation error:', err)
    return res.status(500).json({ success: false, error: { code: 'GENERATION_ERROR', message: err.message } })
  }
})

// Approve/reject recommendation
router.patch('/:id', async (req: any, res: Response) => {
  try {
    const updates = req.body
    const recommendation = await DatabaseService.prisma.recommendation.update({
      where: { id: req.params.id },
      data: updates
    })

    return res.json({ success: true, data: recommendation, message: 'Recommendation updated successfully' })
  } catch (err: any) {
    console.error('❌ PATCH recommendation error:', err)
    return res.status(500).json({ success: false, error: { code: 'UPDATE_ERROR', message: err.message } })
  }
})

async function checkTransferFeasibility(productId: string, sourceLocationId: string, predictedDemand: number, horizon: number): Promise<{ needsTransfer: boolean; destinationProductAvailable: boolean; fromLocationId?: string; quantity?: number }> {
  try {
    // Check for excess inventory in other locations with this product
    const inventoryRecords = await DatabaseService.prisma.inventory.findMany({
      where: {
        productId,
        location: { id: { not: sourceLocationId } }
      },
      include: {
        location: true
      }
    })

    // Find locations with available surplus
    const candidates = inventoryRecords.filter(inv => inv.quantity > inv.reorderPoint * 2)

    if (!candidates || candidates.length === 0) {
      return { needsTransfer: false, destinationProductAvailable: false }
    }

    // Prefer highest surplus locations
    candidates.sort((a, b) => b.quantity - a.quantity)
    const bestMatch = candidates[0]

    // Ensure destination can absorb the transfer without going below reorder point
    const neededQuantity = predictedDemand * horizon // Estimated demand during lead time
    const remainingCapacity = bestMatch.reorderPoint * 5 // Assume 5x reorder point as buffer

    if (neededQuantity > remainingCapacity) {
      return { needsTransfer: false, destinationProductAvailable: false }
    }

    return {
      needsTransfer: true,
      destinationProductAvailable: true,
      fromLocationId: bestMatch.location.id,
      quantity: Math.min(bestMatch.quantity - bestMatch.reorderPoint, neededQuantity)
    }
  } catch (err) {
    return { needsTransfer: false, destinationProductAvailable: false }
  }
}

export default router