import { Request, Response } from 'express'
import { z } from 'zod'
import DatabaseService from '../services/DatabaseService'

import { Router } from 'express'

const router = Router()

const locationSchema = z.object({
  name: z.string().min(2),
  district: z.string().min(2),
  state: z.string().min(2),
  type: z.string() // "DISTRICT" | "CITY" | "TOWN"
})

// Get all locations
router.get('/', async (req: any, res: Response) => {
  try {
    const locations = await DatabaseService.findAllLocations()

    return res.json({
      success: true,
      data: locations,
      message: 'Locations retrieved successfully'
    })
  } catch (err: any) {
    console.error('❌ GET locations error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Get location by ID
router.get('/:id', async (req: any, res: Response) => {
  try {
    const location = await DatabaseService.findLocationByName(req.params.id)

    if (!location) {
      return res.status(404).json({
        success: false,
        error: { code: 'RECORD_NOT_FOUND', message: 'Location not found' }
      })
    }

    return res.json({ success: true, data: location })
  } catch (err: any) {
    console.error('❌ GET location error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: err.message }
    })
  }
})

// Create location
router.post('/', async (req: any, res: Response) => {
  try {
    const data = locationSchema.parse(req.body)

    const location = await DatabaseService.createLocation(data as any)

    return res.status(201).json({
      success: true,
      data: location,
      message: 'Location created successfully'
    })
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' }
      })
    }
    console.error('❌ POST location error:', err)
    return res.status(500).json({
      success: false,
      error: { code: 'CREATION_ERROR', message: err.message }
    })
  }
})

export default router