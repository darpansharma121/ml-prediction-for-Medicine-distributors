import { Request, Response } from 'express'
import DatabaseService from '../services/DatabaseService'

const router = require('express').Router()

// Main dashboard summary
router.get('/summary', async (req: any, res: Response) => {
  try {
    // Get counts
    const [totalSKUs, totalDistributors, totalInventory, lowStockCount, criticalCount, excessCount, expiryAlerts] = await Promise.all([
      DatabaseService.prisma.product.count(),
      DatabaseService.prisma.distributor.count(),
      DatabaseService.prisma.inventory.findMany({ where: {} }),
      DatabaseService.prisma.inventory.count({ where: { status: 'LOW_STOCK' } }),
      DatabaseService.prisma.inventory.count({ where: { status: 'CRITICAL' } }),
      DatabaseService.prisma.inventory.count({ where: { status: 'EXCESS' } }),
      DatabaseService.prisma.batch.findMany({ where: { status: 'ACTIVE' }, take: 10 })
    ])

    return res.json({
      success: true,
      data: {
        kpis: {
          totalSKUs,
          totalDistributors,
          totalInventoryItems: totalInventory.length,
          productsAtStockOutRisk: lowStockCount + criticalCount,
          excessInventoryCount: excessCount,
          expiryRiskBatches: expiryAlerts.length
        },
        alerts: [] // Filled from separate alert endpoint if needed
      }
    })
  } catch (err: any) {
    console.error('❌ GET dashboard summary error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// KPI details
router.get('/kpi', async (req: any, res: Response) => {
  try {
    const [totalSKUs, totalDistributors, totalInventoryValue, productsAtStockOutRisk, excessInventoryValue, expiryRiskValue] = await Promise.all([
      DatabaseService.prisma.product.count(),
      DatabaseService.prisma.distributor.count(),
      DatabaseService.prisma.inventory.findMany({ include: { product: true, distributor: true } }),
      DatabaseService.prisma.inventory.count({ where: { status: { in: ['LOW_STOCK', 'CRITICAL'] } } }),
      DatabaseService.prisma.inventory.findMany({
        where: { status: 'EXCESS' },
        include: { product: true, distributor: true },
        take: 50
      }),
      DatabaseService.prisma.batch.findMany({
        where: { expiresAt: { lte: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), gte: new Date() }, status: 'ACTIVE' },
        take: 20
      })
    ])

    const totalInventoryValue = excessInventoryValue.reduce((sum, item) => sum + (item.quantity * item.costPerUnit), 0)
    const expiryRiskValue = expiryRiskValue.length * 10 // Estimate based on per-unit cost

    return res.json({
      success: true,
      data: {
        metrics: [
          { name: 'Total SKUs', value: totalSKUs, unit: '', icon: 'box-open', category: 'inventory' },
          { name: 'Total Distributors', value: totalDistributors, unit: '', icon: 'users', category: 'operations' },
          { name: 'Available Inventory', value: totalInventoryValue, unit: 'USD', icon: 'package', category: 'inventory' },
          { name: 'Products at Stock-out Risk', value: productsAtStockOutRisk, unit: '', icon: 'alert-triangle', category: 'risk' },
          { name: 'Excess Inventory Value', value: Math.round(totalInventoryValue), unit: 'USD', icon: 'trending-down', category: 'efficiency' },
          { name: 'Expiry Risk Batches', value: expiryRiskValue.length, unit: '', icon: 'timer', category: 'risk' },
          { name: 'Pending Recommendations', value: 0, unit: '', icon: 'check-circle', category: 'action' },
          { name: 'Order Fulfilment Rate', value: 92, unit: '%', icon: 'check', category: 'operations' }
        ],
        comparison: {
          inventoryHealth: '87% healthy',
          stockOutRate: '5%',
          excessRate: '12%'
        }
      }
    })
  } catch (err: any) {
    console.error('❌ GET dashboard kpi error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Demand trend chart data
router.get('/demand-trend', async (req: any, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const sales = await DatabaseService.prisma.sale.findMany({
      where: { saleDate: { gte: startDate } },
      select: { quantity: true, productId: true, saleDate: true }
    })

    // Aggregate by day
    const dailyMap = new Map<string, number>()
    for (const sale of sales) {
      const dateStr = sale.saleDate.toISOString().split('T')[0]
      dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + sale.quantity)
    }

    const trendData = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, quantity]) => ({ date, quantity }))

    return res.json({ success: true, data: trendData })
  } catch (err: any) {
    console.error('❌ GET demand trend error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Regional demand
router.get('/regional-demand', async (req: any, res: Response) => {
  try {
    const locations = await DatabaseService.prisma.location.findMany()

    const regionalDemand = await Promise.all(locations.map(async (loc) => {
      const recentSales = await DatabaseService.prisma.sale.findMany({
        where: { locationId: loc.id, saleDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
      })
      const totalQuantity = recentSales.reduce((sum, sale) => sum + sale.quantity, 0)
      return {
        locationId: loc.id,
        locationName: loc.name,
        district: loc.district,
        salesCount: recentSales.length,
        totalQuantity,
        avgDailyQuantity: recentSales.length > 0 ? totalQuantity / recentSales.length : 0
      }
    }))

    // Compute health status based on quantity thresholds
    const healthStatus = regionalDemand.map(r => {
      if (r.totalQuantity < 100) return 'low' as const
      if (r.avgDailyQuantity < 10) return 'medium' as const
      return 'healthy' as const
    })

    return res.json({ success: true, data: regionalDemand })
  } catch (err: any) {
    console.error('❌ GET regional demand error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Product category performance
router.get('/category-performance', async (req: any, res: Response) => {
  try {
    const categories = ['TABLETS', 'CAPSULES', 'SYRUPS', 'SUSPENSIONS']

    const performance = await Promise.all(categories.map(async (cat) => {
      const products = await DatabaseService.prisma.product.findMany({ where: { category: cat } })
      let totalDemand = 0
      for (const p of products) totalDemand += p.baseDemand

      const sales = await DatabaseService.prisma.sale.findMany({
        where: { product: { category: cat }, saleDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        select: { quantity: true, revenue: true }
      })
      const totalQuantity = sales.reduce((sum, s) => sum + s.quantity, 0)

      return {
        category: cat,
        productCount: products.length,
        totalDemand,
        recentSalesQuantity: totalQuantity,
        revenue30Day: sales.reduce((sum, s) => sum + Number(s.revenue), 0),
        healthStatus: 'healthy'
      }
    }))

    return res.json({ success: true, data: performance })
  } catch (err: any) {
    console.error('❌ GET category performance error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

// Alerts for the dashboard
router.get('/alerts', async (req: any, res: Response) => {
  try {
    const alerts = []

    // Critical inventory alerts
    const criticalInventory = await DatabaseService.prisma.inventory.findMany({
      where: { status: { in: ['LOW_STOCK', 'CRITICAL'] } },
      include: { location: true, product: true, distributor: true }
    })
    for (const inv of criticalInventory) {
      alerts.push({
        type: 'INVENTORY_ALERT',
        severity: 'critical',
        productName: inv.product.name,
        sku: inv.product.sku,
        location: inv.location.name,
        message: `${inv.product.name} at ${inv.location.name} is running low with ${inv.quantity} units remaining`,
        timestamp: new Date().toISOString(),
        status: 'open'
      })
    }

    // Expiry alerts
    const expiringBatches = await DatabaseService.prisma.batch.findMany({
      where: {
        expiresAt: { lte: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), gte: new Date() },
        status: 'ACTIVE'
      },
      take: 5,
      orderBy: { expiresAt: 'asc' },
      include: { product: true, location: true }
    })
    for (const batch of expiringBatches) {
      alerts.push({
        type: 'EXPIRY_ALERT',
        severity: batch.remainingShelfLife < 30 ? 'critical' : 'warning',
        productName: batch.product.name,
        batchNumber: batch.batchNumber,
        location: batch.location.name,
        message: `${batch.product.name} batch ${batch.batchNumber} will expire in ${batch.remainingShelfLife} days`,
        timestamp: new Date().toISOString(),
        status: 'open'
      })
    }

    // Sort alerts by severity
    alerts.sort((a: any, b: any) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })

    return res.json({ success: true, data: alerts })
  } catch (err: any) {
    console.error('❌ GET dashboard alerts error:', err)
    return res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: err.message } })
  }
})

export default router