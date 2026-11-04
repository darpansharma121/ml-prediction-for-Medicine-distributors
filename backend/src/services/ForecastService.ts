import { DatabaseService } from './DatabaseService'
import { PrismaClient } from '../generated/prisma'
import { Prisma } from '../generated/prisma'

export class ForecastService {
  private prisma: PrismaClient
  private models: any[] = [] // Lazy load xgboost model

  constructor(databaseService: DatabaseService) {
    this.prisma = databaseService.prisma as unknown as PrismaClient
    this.models = []
  }

  async initialize(): Promise<void> {
    // Load ML service if available
    try {
      const axios = require('axios')
      const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
      this.mlClient = axios.create({ baseURL: ML_SERVICE_URL, timeout: 10000 })
      await this.mlClient.get('/health')
      console.log('🤖 ML service connected at', ML_SERVICE_URL)
    } catch (err: any) {
      console.warn('⚠️ ML service not available, using statistical fallback:', err.message)
    }
  }

  /**
   * Generate demand forecast using Moving Average or XGBoost
   */
  async generateForecast(productId: string, locationId: string, horizon: number): Promise<any> {
    const inventoryRecords = await this.prisma.inventory.findMany({
      where: { locationId, productId },
      include: { product: true }
    })

    if (inventoryRecords.length === 0) {
      return {
        predictions: [],
        metrics: {},
        model: 'NA',
        warning: 'No inventory records found for this product/location'
      }
    }

    const recentSales = await this.prisma.sale.findMany({
      where: { productId, locationId },
      select: { quantity: true, saleDate: true },
      orderBy: { saleDate: 'desc' },
      skip: horizon + 30 // Take last 60 days of data
    })

    if (recentSales.length === 0) {
      return {
        predictions: [],
        metrics: {},
        model: 'MOVING_AVERAGE',
        warning: 'Insufficient historical data for forecasting'
      }
    }

    // Build feature matrix
    const features = this.buildFeatures(recentSales, horizon)

    // Try XGBoost if available, otherwise fall back to moving average
    let predictions: number[] = []
    let modelName = 'MOVING_AVERAGE'

    if (horizon <= 14 && features.length >= 30) {
      try {
        const predictionsResult = await this.predictXGBoost(features, horizon)
        if (predictionsResult.predictions.length > 0) {
          modelName = 'XGBOOST'
          predictions = predictionsResult.predictions
        } else {
          predictions = this.movingAveragePredict(features, horizon)
        }
      } catch {
        predictions = this.movingAveragePredict(features, horizon)
      }
    } else {
      predictions = this.movingAveragePredict(features, horizon)
    }

    // Add today as first prediction
    predictions.unshift(Math.round(this.computeMovingAverage(recentSales, 7)))

    // Convert dates
    const forecastDates = predictions.map((qty, idx) => ({
      date: new Date(Date.now() + idx * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      predicted_demand: qty
    }))

    // Calculate metrics against recent period actuals
    const metric = this.computeMetrics(recentSales.slice(-30), predictions.slice(1))

    // Save forecast record
    await this.prisma.forecast.create({
      data: {
        productId,
        locationId,
        model: modelName,
        horizon,
        forecastDate: new Date(),
        predictions: JSON.stringify(forecastDates),
        metrics: JSON.stringify(metric),
        accuracy: metric.accuracy ? Math.round(metric.accuracy * 100) / 100 : null
      }
    })

    return {
      sku: inventoryRecords[0]?.product.sku || '',
      location_id: locationId,
      model: modelName,
      horizon,
      predictions: forecastDates,
      metrics: metric
    }
  }

  private buildFeatures(sales: any[], horizon: number): any[] {
    const result = []
    const lastPoints = sales.slice(-59) // Get enough points for rolling stats
    const totalSales = sales.reduce((sum, s) => sum + s.quantity, 0)

    for (let i = 0; i < horizon; i++) {
      // Look-back values for lags
      const lag1 = sales.length >= 1 ? sales[sales.length - 1].quantity : 0
      const lag7 = sales.length >= 7 ? sales[sales.length - 7].quantity : 0
      const lag14 = sales.length >= 14 ? sales[sales.length - 14].quantity : 0
      const lag28 = sales.length >= 28 ? sales[sales.length - 28].quantity : 0

      // Rolling averages
      const ma7 = this.rollingMean(sales, Math.max(0, sales.length - 7))
      const ma14 = this.rollingMean(sales, Math.max(0, sales.length - 14))
      const ma30 = this.rollingMean(sales, Math.max(0, sales.length - 30))

      // Day of week encoding
      const lastSaleDay = sales[sales.length - 1]?.saleDate
      const dow = lastSaleDay ? new Date(lastSaleDay).getDay() : 0

      result.push({
        lag_1: lag1,
        lag_7: lag7,
        lag_14: lag14,
        lag_28: lag28,
        ma7,
        ma14,
        ma30,
        dow,
        total_sales_past_30: sales.slice(-30).reduce((s, r) => s + r.quantity, 0)
      })
    }

    return result
  }

  private rollingMean(sales: any[], windowStart: number): number {
    const end = Math.min(windowStart + windowSize, sales.length)
    const start = Math.max(windowStart, 0)
    let sum = 0
    for (let i = start; i < end; i++) {
      sum += sales[i].quantity
    }
    return sum / Math.max(end - start, 1)
  }

  private computeMovingAverage(sales: any[], horizon: number): number[] {
    const result = []
    const avg = this.rollingMean(sales, sales.length - 7)
    const std = this.rollingStd(sales, sales.length - 30)

    for (let i = 0; i < horizon; i++) {
      // Simple MA approach with small random variation
      const noise = Math.random() * std * 0.5
      result.push(Math.round(avg + noise))
    }
    return result
  }

  private rollingStd(sales: any[], lookback: number): number {
    const end = Math.min(lookback + sales.length, sales.length)
    const window = sales.slice(-end)
    const mean = window.reduce((s, r) => s + r.quantity, 0) / Math.max(window.length, 1)
    const variance = window.reduce((s, r) => s + Math.pow(r.quantity - mean, 2), 0) / Math.max(window.length, 1)
    return Math.sqrt(variance)
  }

  /**
   * Compute error metrics WAPE, MAE, RMSE
   */
  private computeMetrics(actuals: any[], forecasts: number[]): any {
    // Align arrays by index
    const len = Math.min(actuals.length, forecasts.length)
    const recentActuals = actuals.slice(-len)
    const recentForecasts = forecasts.slice(-len)

    const errors = recentActuals.map((a, i) => a.quantity - recentForecasts[i])
    const absErrors = errors.map(e => Math.abs(e))
    const squaredErrors = errors.map(e => e * e)

    const totalActual = recentActuals.reduce((s, a) => s + a.quantity, 0)
    const wape = totalActual > 0 ? errors.reduce((s, e) => s + Math.abs(e), 0) / totalActual : 0
    const mae = absErrors.reduce((s, e) => s + e, 0) / Math.max(len, 1)
    const rmse = Math.sqrt(squaredErrors.reduce((s, e) => s + e, 0) / Math.max(len, 1))

    return {
      wape: Math.round(wape * 100) / 100,
      mae: Math.round(mae * 100) / 100,
      rmse: Math.round(rmse * 100) / 100,
      sampleSize: len
    }
  }

  /**
   * Attempt XGBoost prediction via ML service
   */
  private async predictXGBoost(features: any[], horizon: number): Promise<{ predictions: number[] }> {
    try {
      const response = await this.mlClient!.post('/forecast', {
        features,
        horizon
      })
      const data = response.data as any
      return { predictions: data.predictions || data.predicted_demand }
    } catch {
      throw new Error('ML prediction unavailable')
    }
  }

  /**
   * Compare forecasts of different models
   */
  async compareModels(productId: string, locationId: string): Promise<any[]> {
    const models = ['MOVING_AVERAGE', 'XGBOOST']

    const results = []
    for (const model of models) {
      const forecasts = await this.prisma.forecast.findMany({
        where: { productId, locationId, model },
        take: 1
      })

      if (forecasts.length > 0) {
        results.push({
          model,
          lastForecast: forecasts[0],
          isAvailable: true
        })
      } else {
        results.push({
          model,
          lastForecast: null,
          isAvailable: false
        })
      }
    }

    return results
  }
}
