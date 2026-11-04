import type { Request, Response, NextFunction } from 'express'

export function setupErrorHandling() {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('❌ Error handler caught:', err)

    // Default error status
    const statusCode = err.statusCode || 500

    // Default error message
    const message = err.message || 'Internal Server Error'

    // Log stack trace in development
    if (process.env.NODE_ENV === 'development') {
      console.error('📋 Error stack:', err.stack)
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map((e: any) => ({
        field: e.path,
        message: e.message
      }))

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message,
          details: errors
        }
      })
    }

    // Prisma P2002 - Unique constraint violation
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT_ERROR',
          message: `A record with this ${err.meta?.target || 'field'} already exists`
        }
      })
    }

    // Prisma P2003 - Foreign key constraint violation
    if (err.code === 'P2003') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FOREIGN_KEY_CONSTRAINT_ERROR',
          message: err.message
        }
      })
    }

    // Prisma P2014 - Transaction limit reached
    if (err.code === 'P2014') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TRANSACTION_LIMIT_ERROR',
          message: err.message
        }
      })
    }

    // Prisma P2023 - Record to update not found
    if (err.code === 'P2023') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RECORD_NOT_FOUND',
          message: err.message
        }
      })
    }

    // Default error response
    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      }
    })
  }
}