/**
 * JWT Payload structure for Topcoder tokens.
 * Based on reference implementations from projects-api-v6 / review-api-v6.
 */
export interface JwtPayloadDto {
  /** Topcoder user ID */
  sub: string;

  /** Topcoder handle (username) */
  handle: string;

  /** User email */
  email?: string;

  /** User roles (e.g., ['user'], ['admin'], ['copilot']) */
  roles?: string[];

  /** Token issuer (e.g., https://topcoder-dev.auth0.com/) */
  iss: string;

  /** Issued at timestamp */
  iat: number;

  /** Expiration timestamp */
  exp: number;

  /** Legacy userId field (some tokens may use this instead of sub) */
  userId?: string;
}
