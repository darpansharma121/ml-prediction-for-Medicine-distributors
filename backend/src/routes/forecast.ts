import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

const router = require('express').Router()

const forecastSchema = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  model: z.enum(['MOVING_AVERAGE', 'XGBOOST']),
  horizon: z.number().int().positive()
})

// Generate forecast
router.post('/', async (req: any, res: Response) => {
  try {
    const data = forecastSchema.parse(req.body)
    const userId = req.user?.id || null

    // Get forecasts
    const forecasts = await DatabaseService.prisma.forecast.findMany({
      where: { productId: data.productId, locationId: data.locationId },
      orderBy: { forecastDate: 'desc' },
      take: 5
    })

    return res.json({
      success: true,
      data: {
        recentForecasts: forecasts,
        message: 'Forecast request received',
        details: {
          model: data.model,
          horizon: data.horizon,
          product: data.productId,
          location: data.locationId,
          generatedAt: new Date().toISOString(),
          userId
        }
      }
    })
  } catch (err: any) {
    console.error('❌ POST forecast error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FORECAST_ERROR', message: err.message }
    })
  }
})

// Get forecasts by product and location
router.get('/product/:productId/location/:locationId', async (req: any, res: Response) => {
  try {
    const forecasts = await DatabaseService.prisma.forecast.findMany({
      where: {
        productId: req.params.productId,
        locationId: req.params.locationId
      },
      orderBy: { forecastDate: 'desc' }
    })

    return res.json({ success: true, data: forecasts })
  } catch (err: any) {
    console.error('❌ GET forecast error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

export default router