import { PrismaClient } from '../generated/client'
import { User } from '../generated/client'

export class DatabaseService {
  private prisma: PrismaClient

  constructor() {
    // Use DATABASE_URL from environment if available, otherwise use default
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/mediflow_ai'
    this.prisma = new PrismaClient({
      datasourceUrl: databaseUrl,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
    })
  }

  async connect(): Promise<void> {
    try {
      // Force a connection to verify database is reachable
      await this.prisma.$connect()
      console.log('✅ Database connection established')
    } catch (error) {
      console.error('❌ Database connection failed:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect()
      console.log('✅ Database connection closed')
    } catch (error) {
      console.error('❌ Database disconnection error:', error)
      throw error
    }
  }

  // User methods
  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } })
  }

  async createUser(data: { email: string; passwordHash: string; name: string; role?: string; locationId?: string }): Promise<User> {
    return this.prisma.user.create({ data })
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.prisma.user.update({ where: { id }, data })
  }

  // Location methods
  async findLocationByName(name: string, district?: string): Promise<any> {
    return this.prisma.location.findFirst({ where: { name, district } })
  }

  async createLocation(data: {
    name: string
    district: string
    state: string
    type: string
  }): Promise<any> {
    return this.prisma.location.create({ data })
  }

  async findAllLocations(): Promise<any[]> {
    return this.prisma.location.findMany()
  }

  // Distributor methods
  async findDistributorByCode(code: string): Promise<any> {
    return this.prisma.distributor.findUnique({ where: { code } })
  }

  async createDistributor(data: {
    name: string
    code: string
    locationId: string
    contactPerson?: string
    contactPhone?: string
    email?: string
  }): Promise<any> {
    return this.prisma.distributor.create({ data })
  }

  async findDistributorsByLocation(locationId: string): Promise<any[]> {
    return this.prisma.distributor.findMany({ where: { locationId } })
  }

  // Product methods
  async findProductBySKU(sku: string): Promise<any> {
    return this.prisma.product.findUnique({ where: { sku } })
  }

  async createProduct(data: {
    sku: string
    name: string
    category: string
    dosageForm: string
    unitOfMeasurement: string
    shelfLifeDays: number
    minimumStockThreshold: number
    baseDemand: number
  }): Promise<any> {
    return this.prisma.product.create({ data })
  }

  async findAllProducts(): Promise<any[]> {
    return this.prisma.product.findMany()
  }

  async findProductsByLocation(locationId: string): Promise<any[]> {
    return this.prisma.product.findMany({
      where: {
        batches: {
          some: {
            locationId
          }
        }
      }
    })
  }

  // Batch methods
  async findBatchByNumber(batchNumber: string): Promise<any> {
    return this.prisma.batch.findUnique({ where: { batchNumber } })
  }

  async createBatch(data: {
    batchNumber: string
    productId: string
    locationId: string
    quantity: number
    manufacturedAt: Date
    expiresAt: Date
    remainingShelfLife: number
    costPerUnit: number
  }): Promise<any> {
    return this.prisma.batch.create({ data })
  }

  async findBatchesByProduct(productId: string): Promise<any[]> {
    return this.prisma.batch.findMany({ where: { productId } })
  }

  async findExpiringBatches(days: number): Promise<any[]> {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() + days)
    return this.prisma.batch.findMany({
      where: {
        expiresAt: {
          lte: fromDate,
          gte: new Date()
        },
        status: 'ACTIVE'
      }
    })
  }

  // Inventory methods
  async findInventoryByLocationProductDistributor(locationId: string, productId: string, distributorId: string): Promise<any> {
    return this.prisma.inventory.findUnique({
      where: { locationId_productId_distributorId: { locationId, productId, distributorId } }
    })
  }

  async createInventory(data: {
    locationId: string
    productId: string
    distributorId: string
    quantity: number
    reorderPoint: number
    status: string
  }): Promise<any> {
    return this.prisma.inventory.create({ data })
  }

  async updateInventory(id: string, data: Partial<any>): Promise<any> {
    return this.prisma.inventory.update({ where: { id }, data })
  }

  async findAllInventory(): Promise<any[]> {
    return this.prisma.inventory.findMany({
      include: {
        location: true,
        product: true,
        distributor: true
      }
    })
  }

  async findLowStockInventory(): Promise<any[]> {
    return this.prisma.inventory.findMany({
      where: { status: 'LOW_STOCK' },
      include: {
        location: true,
        product: true,
        distributor: true
      }
    })
  }

  async findCriticalInventory(): Promise<any[]> {
    return this.prisma.inventory.findMany({
      where: { status: 'CRITICAL' },
      include: {
        location: true,
        product: true,
        distributor: true
      }
    })
  }

  // Sale methods
  async createSale(data: {
    productId: string
    locationId: string
    distributorId?: string
    quantity: number
    revenue: number
  }): Promise<any> {
    return this.prisma.sale.create({ data })
  }

  async findSalesByProduct(productId: string): Promise<any[]> {
    return this.prisma.sale.findMany({
      where: { productId },
      orderBy: { saleDate: 'desc' }
    })
  }

  async findSalesByLocation(locationId: string): Promise<any[]> {
    return this.prisma.sale.findMany({
      where: { locationId },
      orderBy: { saleDate: 'desc' }
    })
  }

  // Order methods
  async createOrder(data: {
    distributorId: string
    items: Array<{ productId: string; quantity: number; unitPrice: number }>
    totalAmount: number
    expectedDelivery?: Date
  }): Promise<any> {
    return this.prisma.order.create({ data })
  }

  async findOrdersByDistributor(distributorId: string): Promise<any[]> {
    return this.prisma.order.findMany({
      where: { distributorId },
      orderBy: { orderDate: 'desc' },
      include: { items: true }
    })
  }

  // Forecast methods
  async createForecast(data: {
    productId: string
    locationId: string
    model: string
    horizon: number
    predictions: any
    metrics: any
  }): Promise<any> {
    return this.prisma.forecast.create({ data })
  }

  async findForecastsByProduct(productId: string): Promise<any[]> {
    return this.prisma.forecast.findMany({
      where: { productId },
      orderBy: { forecastDate: 'desc' }
    })
  }

  // Recommendation methods
  async createRecommendation(data: {
    type: string
    priority: string
    status: string
    productId: string
    locationId: string
    currentInventory: number
    predictedDemand: number
    reorderPoint: number
    incomingStock: number
    recommendedQty: number
    transferFrom?: string
    explanation: string
  }): Promise<any> {
    return this.prisma.recommendation.create({ data })
  }

  async findRecommendationsByStatus(status: string): Promise<any[]> {
    return this.prisma.recommendation.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' }
    })
  }

  // Inventory Transfer methods
  async createInventoryTransfer(data: {
    sourceLocationId: string
    targetLocationId: string
    productId: string
    quantity: number
    status: string
    notes?: string
  }): Promise<any> {
    return this.prisma.inventoryTransfer.create({ data })
  }

  async findTransfersByStatus(status: string): Promise<any[]> {
    return this.prisma.inventoryTransfer.findMany({
      where: { status },
      orderBy: { requestedAt: 'desc' }
    })
  }

  // Notification methods
  async createNotification(data: {
    userId: string
    type: string
    message: string
    isRead?: boolean
  }): Promise<any> {
    return this.prisma.notification.create({ data })
  }

  async findNotificationsByUser(userId: string): Promise<any[]> {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })
  }

  // System Metric methods
  async createSystemMetric(data: {
    metricName: string
    metricValue: number
    metricUnit?: string
  }): Promise<any> {
    return this.prisma.systemMetric.create({ data })
  }

  async findSystemMetricsByName(metricName: string): Promise<any[]> {
    return this.prisma.systemMetric.findMany({
      where: { metricName },
      orderBy: { recordedAt: 'desc' }
    })
  }

  // Transaction methods
  async beginTransaction(): Promise<PrismaClient> {
    return this.prisma.$transaction()
  }
}

export default DatabaseService
export const db = new DatabaseService()