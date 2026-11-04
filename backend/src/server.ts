import express, { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { DatabaseService } from './services/DatabaseService'
import { ForecastService } from './services/ForecastService'
import { RecommendationService } from './services/RecommendationService'
import authRoutes from './routes/auth'
import productRoutes from './routes/product'
import locationRoutes from './routes/location'
import distributorRoutes from './routes/distributor'
import inventoryRoutes from './routes/inventory'
import saleRoutes from './routes/sale'
import orderRoutes from './routes/order'
import deliveryRoutes from './routes/delivery'
import forecastRoutes from './routes/forecast'
import recommendationRoutes from './routes/recommendation'
import expiryRoutes from './routes/expiry'
import dashboardRoutes from './routes/dashboard'
import { setupErrorHandling } from './middleware/errorHandler'
import { setupLogging } from './middleware/logging'

// Load environment variables
dotenv.config()

const app = express()
const httpServer = createServer(app)

// Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}))
app.use(compression())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(setupLogging())

// Initialize services
const databaseService = new DatabaseService()
const forecastService = new ForecastService(databaseService)
const recommendationService = new RecommendationService(databaseService, forecastService)

// Global service instances
(global as any).services = {
  databaseService,
  forecastService,
  recommendationService
}

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/locations', locationRoutes)
app.use('/api/distributors', distributorRoutes)
app.use('/api/inventory', inventoryRoutes)
app.use('/api/sales', saleRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/deliveries', deliveryRoutes)
app.use('/api/forecast', forecastRoutes)
app.use('/api/recommendations', recommendationRoutes)
app.use('/api/expiry', expiryRoutes)
app.use('/api/dashboard', dashboardRoutes)

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'MediFlow AI Backend is running',
    timestamp: new Date().toISOString()
  })
})

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`
    }
  })
})

// Setup error handling
const errorHandler = setupErrorHandling()
app.use(errorHandler)

// Initialize Socket.IO for real-time updates
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id)
  socket.on('join-location', (locationId: string) => {
    socket.join(`location-${locationId}`)
  })
  socket.on('leave-location', (locationId: string) => {
    socket.leave(`location-${locationId}`)
  })
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3000

async function startServer() {
  try {
    await databaseService.connect()
    await forecastService.initialize()

    httpServer.listen(PORT, () => {
      console.log(`🚀 MediFlow AI Backend running on port ${PORT}`)
      console.log('📊 Database connected and ready')
      console.log('🤖 ML service initialized')
      console.log(`🌐 API health check: http://localhost:${PORT}/api/health`)
    })

    process.on('SIGTERM', async () => {
      await databaseService.disconnect()
      process.exit(0)
    })
    process.on('SIGINT', async () => {
      await databaseService.disconnect()
      process.exit(0)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()

export default app