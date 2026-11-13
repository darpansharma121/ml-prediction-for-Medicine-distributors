// Seed script for MediFlow AI
// Generates synthetic pharmaceutical distribution data for demonstration
import { PrismaClient, ProductCategory, ProductStatus, InventoryStatus, UserRole, OrderStatus, DeliveryStatus, RecommendationPriority, RecommendationType, RecommendationStatus } from '../generated/client'
import { faker } from '@faker-js/faker'

const prisma = new PrismaClient()

// Generate realistic synthetic data with fixed seed for reproducibility
faker.seed(12345)

async function generateLocations() {
  const locations = []
  const districts = ['Kamrup Metro', 'Sonitpur', 'Nagaon', 'Jorhat', 'Dibrugarh', 'Cachar']
  const states = ['Assam', 'Arunachal Pradesh', 'Nagaland', 'Mizoram', 'Tripura']

  for (const district of districts) {
    for (let i = 0; i < 3; i++) {
      locations.push({
        name: `${faker.company.name()} ${i === 0 ? 'Hub' : i === 1 ? 'Depot' : 'Warehouse'} ${faker.location.city().split(',')[0]}`,        district: district,
        state: 'Assam',
        type: faker.helpers.arrayElement(['DISTRICT', 'CITY', 'TOWN']),
      })
    }
  }

  return await prisma.location.createMany({ data: locations })
}

async function generateDistributors() {
  const locations = await prisma.location.findMany()
  const distributors = []

  for (let i = 0; i < 8; i++) {
    const location = faker.helpers.arrayElement(locations)
    distributors.push({
      name: faker.company.name(),
      code: `DIST-${String(i + 1).padStart(3, '0')}`,      locationId: location.id,
      contactPerson: faker.person.fullName(),
      contactPhone: `+91-${faker.phone.number('9XXXXXXXXX')}`,
      email: faker.internet.email(),
    })
  }

  return await prisma.distributor.createMany({ data: distributors })
}

async function generateProducts() {
  const categories = Object.values(ProductCategory)
  const products = []

  const productTemplates = [
    { name: 'Paracetamol 500mg', category: ProductCategory.TABLETS, dosageForm: 'Tablet', unit: 'Tablets', shelfLife: 24, baseDemand: 1000 },
    { name: 'Cough Syrup', category: ProductCategory.SYRUPS, dosageForm: 'Oral Liquid', unit: 'Bottles', shelfLife: 36, baseDemand: 500 },
    { name: 'Amoxicillin 250mg', category: ProductCategory.CAPSULES, dosageForm: 'Capsule', unit: 'Capsules', shelfLife: 30, baseDemand: 800 },
    { name: 'Ibuprofen 400mg', category: ProductCategory.TABLETS, dosageForm: 'Tablet', unit: 'Tablets', shelfLife: 24, baseDemand: 700 },
    { name: 'Azithromycin 500mg', category: ProductCategory.CAPSULES, dosageForm: 'Capsule', unit: 'Capsules', shelfLife: 30, baseDemand: 400 },
    { name: 'Doxycycline 100mg', category: ProductCategory.CAPSULES, dosageForm: 'Capsule', unit: 'Capsules', shelfLife: 36, baseDemand: 300 },
    { name: 'Montelukast 10mg', category: ProductCategory.TABLETS, dosageForm: 'Tablet', unit: 'Tablets', shelfLife: 36, baseDemand: 200 },
    { name: 'Salbutamol Inhaler', category: ProductCategory.SYRUPS, dosageForm: 'Inhaler', unit: 'Inhalers', shelfLife: 12, baseDemand: 150 },
  ]

  for (let i = 0; i < 20; i++) {
    const template = faker.helpers.arrayElement(productTemplates)
    const sku = `SKU-${faker.string.alphanumeric(6).toUpperCase()}`
    products.push({
      sku: sku,
      name: `${template.name} ${faker.helpers.arrayElement(['Standard', 'Generic', 'Premium'])}`,
      category: template.category,
      dosageForm: template.dosageForm,
      unitOfMeasurement: template.unit,
      shelfLifeDays: template.shelfLife,
      minimumStockThreshold: Math.floor(template.baseDemand * 0.1),
      baseDemand: template.baseDemand * (0.5 + Math.random()),
      status: ProductStatus.ACTIVE,
    })
  }

  return await prisma.product.createMany({ data: products })
}

async function generateBatches() {
  const products = await prisma.product.findMany()
  const locations = await prisma.location.findMany()
  const batches = []

  for (let i = 0; i < 150; i++) {
    const product = faker.helpers.arrayElement(products)
    const location = faker.helpers.arrayElement(locations)
    const manufacturedAt = faker.date.past({ years: 1 })
    const shelfLifeDays = product.shelfLifeDays
    const expiresAt = new Date(manufacturedAt)
    expiresAt.setDate(expiresAt.getDate() + shelfLifeDays)
    const remainingShelfLife = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))

    batches.push({
      batchNumber: `BATCH-${faker.string.alphanumeric(6).toUpperCase()}`,      productId: product.id,
      locationId: location.id,
      quantity: faker.datatype.boolean() ? faker.number.int({ min: 100, max: 10000 }) : faker.number.int({ min: 1, max: 100 }),
      manufacturedAt: manufacturedAt,
      expiresAt: expiresAt,
      remainingShelfLife: remainingShelfLife,
      costPerUnit: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }).toString(),
      status: expiresAt < new Date() ? 'EXPIRED' : (remainingShelfLife < 30 ? 'CRITICAL' : 'ACTIVE'),
    })
  }

  return await prisma.batch.createMany({ data: batches })
}

async function generateInventory() {
  const products = await prisma.product.findMany()
  const locations = await prisma.location.findMany()
  const distributors = await prisma.distributor.findMany()
  const inventoryRecords = []

  for (const product of products.slice(0, 15)) {
    for (const location of faker.helpers.arrayElements(locations, { min: 1, max: 3 })) {
      for (const distributor of faker.helpers.arrayElements(distributors, { min: 1, max: 2 })) {
        const quantity = faker.helpers.arrayElement(['HEALTHY', 'LOW_STOCK', 'CRITICAL', 'EXCESS'])
        let baseQty: number

        switch (quantity) {
          case 'HEALTHY':
            baseQty = Math.floor(product.baseDemand * (0.5 + Math.random()))
            break
          case 'LOW_STOCK':
            baseQty = Math.floor(product.minimumStockThreshold * (0.3 + Math.random()))
            break
          case 'CRITICAL':
            baseQty = Math.floor(product.minimumStockThreshold * (0.1 + Math.random()))
            break
          case 'EXCESS':
            baseQty = Math.floor(product.baseDemand * (2.5 + Math.random()))
            break
          default:
            baseQty = Math.floor(product.baseDemand * 0.5)
        }

        inventoryRecords.push({
          locationId: location.id,
          productId: product.id,
          distributorId: distributor.id,
          quantity: baseQty,
          incomingQuantity: faker.datatype.boolean() ? faker.number.int({ min: 50, max: 500 }) : 0,
          reorderPoint: product.minimumStockThreshold,
          status: quantity as InventoryStatus,
        })
      }
    }
  }

  return await prisma.inventory.createMany({ data: inventoryRecords })
}

async function generateHistoricalSales() {
  const products = await prisma.product.findMany()
  const locations = await prisma.location.findMany()
  const salesRecords = []

  for (let day = 365; day >= 0; day--) {
    const date = new Date()
    date.setDate(date.getDate() - day)

    for (const product of faker.helpers.arrayElements(products, { min: 5, max: 15 })) {
      for (const location of faker.helpers.arrayElements(locations, { min: 1, max: 3 })) {
        if (faker.datatype.boolean({ probability: 0.8 })) {
          const baseDailyDemand = product.baseDemand / 365
          const variation = faker.number.float({ min: 0.5, max: 2.5 })
          const dailySales = Math.max(0, Math.floor(baseDailyDemand * variation))

          if (dailySales > 0) {
            salesRecords.push({
              productId: product.id,
              locationId: location.id,
              quantity: dailySales,
              saleDate: date,
              revenue: (dailySales * parseFloat(product.costPerUnit || '100')).toFixed(2),
            })
          }
        }
      }
    }
  }

  return await prisma.sale.createMany({ data: salesRecords })
}

async function generateOrders() {
  const distributors = await prisma.distributor.findMany()
  const products = await prisma.product.findMany()
  const orders = []

  for (let i = 0; i < 25; i++) {
    const distributor = faker.helpers.arrayElement(distributors)
    const orderDate = faker.date.between({ from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to: new Date() })
    const status = faker.helpers.arrayElement([OrderStatus.CONFIRMED, OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.PENDING])

    const orderItems = []
    const itemCount = faker.number.int({ min: 3, max: 8 })
    let totalAmount = 0

    for (let j = 0; j < itemCount; j++) {
      const product = faker.helpers.arrayElement(products)
      const quantity = faker.number.int({ min: 50, max: 1000 })
      const unitPrice = faker.number.float({ min: 50, max: 1000, fractionDigits: 2 })
      totalAmount += quantity * unitPrice

      orderItems.push({
        productId: product.id,
        quantity: quantity,
        unitPrice: unitPrice.toString(),
      })
    }

    orders.push({
      distributorId: distributor.id,
      status: status,
      totalAmount: totalAmount.toFixed(2),
      orderDate: orderDate,
      expectedDelivery: new Date(orderDate.getTime() + faker.number.int({ min: 3, max: 15 }) * 24 * 60 * 60 * 1000),
      actualDelivery: status === OrderStatus.DELIVERED || status === OrderStatus.SHIPPED ? new Date(orderDate.getTime() + faker.number.int({ min: 5, max: 20 }) * 24 * 60 * 60 * 1000) : null,
    })
  }

  const createdOrders = await prisma.order.createManyAndReturn({ data: orders })

  for (let i = 0; i < createdOrders.length; i++) {
    const order = createdOrders[i]
    const items = orders[i].items as any[]

    const orderItemsData = items.map(item => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }))

    await prisma.orderItem.createMany({ data: orderItemsData })
  }
}

async function generateDeliveries() {
  const orders = await prisma.order.findMany()
  const locations = await prisma.location.findMany()
  const deliveries = []

  for (const order of orders) {
    if (order.actualDelivery) {
      const fromLocation = faker.helpers.arrayElement(locations)
      const toLocation = faker.helpers.arrayElement(locations.filter(l => l.id !== fromLocation.id))

      deliveries.push({
        orderId: order.id,
        fromLocationId: fromLocation.id,
        toLocationId: toLocation.id,
        status: faker.helpers.arrayElement([DeliveryStatus.DELIVERED, DeliveryStatus.IN_TRANSIT, DeliveryStatus.DELAYED]),
        scheduledAt: order.expectedDelivery || new Date(),
        deliveredAt: order.actualDelivery,
        actualDeliveryTime: faker.number.int({ min: 120, max: 1440 }), // minutes
        trackingNumber: `TRK-${faker.string.alphanumeric(10).toUpperCase()}`,      })
    }
  }

  return await prisma.delivery.createMany({ data: deliveries })
}

async function generateRecommendations() {
  const products = await prisma.product.findMany()
  const locations = await prisma.location.findMany()
  const recommendations = []

  for (let i = 0; i < 20; i++) {
    const product = faker.helpers.arrayElement(products)
    const location = faker.helpers.arrayElement(locations)
    const type = faker.helpers.arrayElement([RecommendationType.REPLENISHMENT, RecommendationType.TRANSFER, RecommendationType.EXPIRY_ALERT])
    const priority = faker.helpers.arrayElement([RecommendationPriority.CRITICAL, RecommendationPriority.HIGH, RecommendationPriority.MEDIUM, RecommendationPriority.LOW])
    const status = faker.helpers.arrayElement([RecommendationStatus.PENDING, RecommendationStatus.APPROVED, RecommendationStatus.COMPLETED])

    recommendations.push({
      type: type,
      priority: priority,
      status: status,
      productId: product.id,
      locationId: location.id,
      currentInventory: faker.number.int({ min: 10, max: 100 }),
      predictedDemand: faker.number.int({ min: 200, max: 1000 }),
      reorderPoint: product.minimumStockThreshold,
      incomingStock: faker.datatype.boolean() ? faker.number.int({ min: 50, max: 500 }) : 0,
      recommendedQty: faker.number.int({ min: 100, max: 2000 }),
      transferFrom: faker.datatype.boolean() ? faker.helpers.arrayElement(locations.map(l => l.id)) : null,
      explanation: `Based on ${faker.number.int({ min: 5, max: 30 })} days of demand forecast and ${faker.number.int({ min: 1, max: 7 })} days lead time.`,      })
  }

  return await prisma.recommendation.createMany({ data: recommendations })
}

async function generateInventoryTransfers() {
  const locations = await prisma.location.findMany()
  const products = await prisma.product.findMany()
  const transfers = []

  for (let i = 0; i < 15; i++) {
    const sourceLocation = faker.helpers.arrayElement(locations)
    const targetLocation = faker.helpers.arrayElement(locations.filter(l => l.id !== sourceLocation.id))
    const product = faker.helpers.arrayElement(products)

    transfers.push({
      sourceLocationId: sourceLocation.id,
      targetLocationId: targetLocation.id,
      productId: product.id,
      quantity: faker.number.int({ min: 100, max: 1000 }),
      status: faker.helpers.arrayElement(['PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED']),
      requestedAt: faker.date.past({ days: 30 }),
      approvedAt: faker.datatype.boolean() ? faker.date.recent({ days: 20 }) : null,
      completedAt: faker.datatype.boolean() ? faker.date.recent({ days: 10 }) : null,
      notes: faker.datatype.boolean() ? `Transfer for emergency restocking of ${product.name}` : null,
    })
  }

  return await prisma.inventoryTransfer.createMany({ data: transfers })
}

async function generateUsers() {
  const locations = await prisma.location.findMany()
  const users = []

  for (let i = 0; i < 10; i++) {
    users.push({
      email: faker.internet.email(),
      passwordHash: '$2b$10$dummy.hash.for.demo.purposes.only',      name: faker.person.fullName(),
      role: faker.helpers.arrayElement([UserRole.ADMIN, UserRole.SUPPLY_CHAIN_MANAGER, UserRole.DISTRIBUTION_MANAGER, UserRole.DISTRIBUTOR, UserRole.STOCKIST]),
      locationId: faker.helpers.arrayElement(locations.map(l => l.id)),
    })
  }

  return await prisma.user.createMany({ data: users })
}

async function main() {
  try {
    console.log('🌱 Starting MediFlow AI database seeding...')

    await generateLocations()
    console.log('✅ Generated locations')

    await generateDistributors()
    console.log('✅ Generated distributors')

    await generateProducts()
    console.log('✅ Generated products')

    await generateBatches()
    console.log('✅ Generated batches')

    await generateInventory()
    console.log('✅ Generated inventory')

    await generateHistoricalSales()
    console.log('✅ Generated historical sales')

    await generateOrders()
    console.log('✅ Generated orders')

    await generateDeliveries()
    console.log('✅ Generated deliveries')

    await generateRecommendations()
    console.log('✅ Generated recommendations')

    await generateInventoryTransfers()
    console.log('✅ Generated inventory transfers')

    await generateUsers()
    console.log('✅ Generated users')

    console.log('\n🎉 MediFlow AI database seeding completed successfully!')
    console.log('\n📊 Demo credentials:')
    console.log('   Email: admin@mediflow.ai')
    console.log('   Password: admin123')

  } catch (error) {
    console.error('❌ Error during seeding:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()