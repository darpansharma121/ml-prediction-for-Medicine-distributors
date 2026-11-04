import { Request, Response } from 'express'
import { z, ZodError } from 'zod'
import { DatabaseService } from '../services/DatabaseService'
import { generateToken } from '../utils/jwt'
import { generateToken } from '../utils/jwt'

const authRouter = require('express').Router()

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'SUPPLY_CHAIN_MANAGER', 'DISTRIBUTION_MANAGER', 'DISTRIBUTOR', 'STOCKIST', 'RETAILER']).optional(),
  locationId: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

// Register endpoint
authRouter.post('/register', async (req: any, res: Response) => {
  try {
    const { email, password, name, role, locationId } = registerSchema.parse(req.body)

    // Check if user already exists
    const existingUser = await DatabaseService.findUserByEmail(email)
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'A user with this email already exists'
        }
      })
    }

    // Create user
    const user = await DatabaseService.createUser({
      email,
      passwordHash: password, // In production, hash the password
      name,
      role: role || 'DISTRIBUTOR',
      locationId
    })

    // Generate token
    const token = generateToken(user.id, user.role || 'DISTRIBUTOR', user.locationId)

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locationId: user.locationId
        },
        token
      },
      message: 'User registered successfully'
    })
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Registration validation failed',
          details: err.errors
        }
      })
    }
    console.error('❌ Auth register error:', err)
    return res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_ERROR',
        message: err.message || 'Registration failed'
      }
    })
  }
})

// Login endpoint
authRouter.post('/login', async (req: any, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    // Find user
    const user = await DatabaseService.findUserByEmail(email)
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid email or password'
        }
      })
    }

    // Verify password (in production, compare hashed password)
    if (user.passwordHash !== password) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid email or password'
        }
      })
    }

    // Generate token
    const token = generateToken(user.id, user.role, user.locationId)

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locationId: user.locationId
        },
        token
      },
      message: 'Login successful'
    })
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Login validation failed',
          details: err.errors
        }
      })
    }
    console.error('❌ Auth login error:', err)
    return res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: err.message || 'Login failed'
      }
    })
  }
})

// Get current user
authRouter.get('/me', async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id']
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'User not authenticated'
        }
      })
    }

    const user = await DatabaseService.findUserById(userId as string)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RECORD_NOT_FOUND',
          message: 'User not found'
        }
      })
    }

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locationId: user.locationId
        }
      }
    })
  } catch (err: any) {
    console.error('❌ Get user error:', err)
    return res.status(500).json({
      success: false,
      error: {
        code: 'USER_FETCH_ERROR',
        message: err.message || 'Failed to fetch user'
      }
    })
  }
})

export default authRouter