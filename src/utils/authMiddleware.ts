import express from 'express';
import jwt from 'jsonwebtoken';

export interface MyContext {
  user?: { name: string; email: string };
}

const JWT_SECRET = process.env.JWT_SECRET || 'secretKey';

export const authMiddleware = (req: express.Request): MyContext => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.split(' ')[1]; // Formato: Bearer TOKEN

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { user: decoded as { name: string; email: string } };
    } catch (err) {
      throw new Error('Invalid or expired token');
    }
  }
  return {};
};
