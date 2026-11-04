import { Request, Response, NextFunction } from 'express'

export function setupLogging() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    const { method, url } = req
    const ip = req.ip || req.connection.remoteAddress || 'unknown'

    // Log request
    console.log(`[${new Date().toISOString()}] ${method} ${url} - ${ip}`)

    // Capture original end
    const originalEnd = res.end
    res.end = function (chunk?: any, encoding?: any, cb?: any) {
      const duration = Date.now() - start
      const statusCode = res.statusCode

      // Log response
      const logLevel = statusCode >= 400 ? '❌' : '✅'
      console.log(`${logLevel} ${method} ${url} ${statusCode} ${duration}ms`)

      return originalEnd.call(res, chunk, encoding, cb)
    }

    next()
  }
}