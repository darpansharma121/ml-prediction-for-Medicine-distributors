import { DatabaseService } from './DatabaseService'
import { ForecastService } from './ForecastService'

export class RecommendationService {
  constructor(private databaseService: DatabaseService, private forecastService: ForecastService) {}

  /**
   * Compute optimal reorder point and safety stock
   */
  computeSafetyStock(avgDailyDemand: number, leadTimeDays: number, serviceLevel: number): number {
    const z = serviceLevel // z-score for service level (e.g., 1.65 for 95%)
    const sigmaDailyDemand = avgDailyDemand * 0.2 // Assume 20% variation
    return Math.ceil(z * Math.sqrt(leadTimeDays) * sigmaDailyDemand + (z - 1) * sigmaDailyDemand)
  }

  computeReorderPoint(safetyStock: number, leadTimeDays: number, avgDailyDemand: number): number {
    return Math.round(safetyStock + (avgDailyDemand || 0) * (leadTimeDays || 7))
  }

  getRecommendedOrderQuantity(currentInventory: number, targetStock: number): number {
    return Math.max(0, targetStock - currentInventory)
  }

  /**
   * Check inventory transfer feasibility across locations
   */
  async checkTransferFeasibility(productId: string, destinationLocationId: string): Promise<any> {
    try {
      // Find surplus inventory in other locations
      const candidates = await this.databaseService.prisma.inventory.findMany({
        where: { productId },
        include: { location: true }
      })

      // Filter out the current location
      const eligible = candidates.filter(inv => inv.location.id !== destinationLocationId && inv.quantity > inv.reorderPoint * 2)

      if (!eligible || eligible.length === 0) {
        return { feasible: false }
      }

      // Sort by surplus quantity descending
      eligible.sort((a, b) => b.quantity - a.quantity)
      const bestMatch = eligible[0]

      if (!bestMatch || bestMatch.quantity < 100) {
        return { feasible: false }
      }

      // Ensure destination can absorb without going below reorder point
      const neededQuantity = 500 // Estimated demand during lead time
      const buffer = bestMatch.reorderPoint * 3 // Safety buffer at source
      const transferQuantity = Math.min(bestMatch.quantity - buffer, neededQuantity)

      if (transferQuantity <= 0) {
        return { feasible: false }
      }

      // Verify target location has enough remaining capacity
      const targetInventory = candidates.find(inv => inv.location.id === destinationLocationId)
      const targetRemaining = targetInventory ? targetInventory.quantity : 0
      const targetReorderPoint = targetInventory?.reorderPoint || 0

      if (targetRemaining < neededQuantity * 2) {
        return { feasible: false }
      }

      // Check batch expiry feasibility
      const sourceBatches = await this.databaseService.prisma.batch.findMany({
        where: {
          productId,
          locationId: bestMatch.location.id,
          status: 'ACTIVE',
          expiresAt: { gte: new Date() }
        },
        include: { location: true },
        take: 1
      })

      if (!sourceBatches || sourceBatches.length === 0) {
        return { feasible: false }
      }

      // Check minimum shelf life requirement
      const minRemainingShelfLife = this.databaseService.prisma.batch.findFirst({
        where: {
          productId,
          locationId: bestMatch.location.id,
          expiresAt: { gte: new Date(), lte: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) }
        }
      })

      if (!minRemainingShelfLife || minRemainingShelfLife.remainingShelfLife < 30) {
        return { feasible: false }
      }

      return {
        feasible: true,
        fromLocationId: bestMatch.location.id,
        toLocationId: destinationLocationId,
        sourceLocationName: bestMatch.location.name,
        transferQuantity: Math.floor(transferQuantity),
        estimatedLeadTime: this.randomLeadTime(3, 5), // Days
        sourceExplanation: `${bestMatch.location.name} has ${bestMatch.quantity} units of ${this.databaseService.prisma.product.findUnique({ where: { id: productId } })?.name} available`,
        destinationExplanation: `Target location needs ${neededQuantity} units. Current stock: ${targetRemaining}, reorder point: ${targetReorderPoint}`
      }
    } catch (err) {
      return { feasible: false }
    }
  }

  randomLeadTime(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
}
