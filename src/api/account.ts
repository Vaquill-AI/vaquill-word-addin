import { request } from "./http";

/** Current account, from GET /auth/me. */
export interface Me {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  organizationId?: string | null;
  isAdmin?: boolean;
  /**
   * False when the identity authenticated (e.g. via Google) but never completed
   * registration, so it has no account yet. The add-in refuses these and sends
   * the person to sign up, since there is no in-Word sign-up.
   */
  initialized?: boolean;
}

export function getMe(): Promise<Me> {
  return request<Me>("/api/v1/auth/me");
}
