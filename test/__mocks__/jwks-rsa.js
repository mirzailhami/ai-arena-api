/**
 * Jest mock for jwks-rsa.
 *
 * jwks-rsa@4 depends on jose@6 which is pure-ESM and cannot be required by
 * Jest's CommonJS transform. In tests we don't need real JWKS key fetching —
 * the e2e suite only verifies that malformed / absent tokens return 401.
 * A mock that returns a fixed secret is enough: valid JWTs will fail signature
 * verification (and return 401), which is exactly what the tests expect.
 */
module.exports = {
  passportJwtSecret: () => (_req, _rawJwt, done) => {
    done(null, 'test-jwks-secret');
  },
};
