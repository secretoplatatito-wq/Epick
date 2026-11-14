import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import type { WorkspaceProject } from '../types';

const STUDIO_TOKEN =
  process.env.CLIPPAH_API_TOKEN && process.env.CLIPPAH_API_TOKEN.trim().length > 0
    ? process.env.CLIPPAH_API_TOKEN.trim()
    : crypto.createHash('sha256').update(process.env.GEMINI_API_KEY || 'clippah-yuangames77-local-secret').digest('hex').slice(0, 32);

export interface AuthenticatedRequest extends Request {
  authContext?: {
    actorId: string;
    authType: 'bearer' | 'studio-session';
  };
}

export function getStudioClientToken(): string {
  return STUDIO_TOKEN;
}

export function extractRequestToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers['x-clippah-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

export function requireApiAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractRequestToken(req);

  if (token) {
    if (token === STUDIO_TOKEN) {
      req.authContext = { actorId: 'studio-admin', authType: 'bearer' };
      return next();
    }
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API or MCP bearer token.',
    });
  }

  // Allow authenticated first-party browser UI calls originating from the studio origin
  const studioSession = req.headers['x-clippah-studio'];
  if (studioSession === '1') {
    req.authContext = { actorId: 'studio-admin', authType: 'studio-session' };
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required. Supply Authorization: Bearer <CLIPPAH_API_TOKEN> or use the authenticated studio session.',
  });
}

export function canAccessWorkspace(workspace: WorkspaceProject, actorId: string): boolean {
  return workspace.ownerId === actorId || workspace.ownerId === 'studio-public' || actorId === 'studio-admin';
}
