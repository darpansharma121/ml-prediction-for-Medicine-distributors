import { Request, Response, NextFunction } from 'express'
import { z, ZodError } from 'zod'

export function setupValidation() {
  // Validate request body against schema
  return (req: Request, res: Response, next: NextFunction) => {
    // If no schema defined on req.bodySchema, skip validation
    if (!req.bodySchema) {
      next()
      return
    }

    try {
      req.bodySchema.parse(req.body)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code
        }))

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body validation failed',
            details: errors
          }
        })
      }
      throw err
    }
  }
}

// Helper to apply schema validation to a route handler
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code
        }))

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body validation failed',
            details: errors
          }
        })
      }
      throw err
    }
  }
}