import * as Joi from 'joi';

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    url: process.env.DATABASE_URL,
  },
  auth: {
    secret: process.env.AUTH_SECRET,
    validIssuers: (process.env.VALID_ISSUERS || '').split(',').filter(Boolean),
  },
  storage: {
    problemsRoot: process.env.PROBLEMS_ROOT || './data/problems',
    arenaWarPath: process.env.ARENA_SYNTHETICA_WAR_PATH || null,
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
  },
});

// Joi validation schema for environment variables
export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: Joi.string().required(),
  AUTH_SECRET: Joi.string().required(),
  VALID_ISSUERS: Joi.string().required(),
  PROBLEMS_ROOT: Joi.string().default('./data/problems'),
  ARENA_SYNTHETICA_WAR_PATH: Joi.string().allow('').optional(),
  CORS_ORIGINS: Joi.string().default('https://local.topcoder-dev.com'),
});
