declare global {
  namespace Express {
    interface Request {
      id: string;
      requestId: string;
      userId?: string;
      userRoles?: string[];
      accessToken?: string;
      rawBody?: string;
      adminRole?: string;
      adminStatus?: string;
      mustChangeCredentials?: boolean;
      mfaRequired?: boolean;
      aal?: string;
    }
  }
}
export {};
