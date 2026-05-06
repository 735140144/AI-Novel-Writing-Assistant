export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role?: string;
        status?: string;
        emailVerifiedAt?: string | null;
      };
    }
  }
}
