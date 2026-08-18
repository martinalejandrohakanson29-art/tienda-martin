import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
    globalForRedis.redis ||
    new Redis(process.env.REDIS_URL as string, { lazyConnect: true, maxRetriesPerRequest: 2 });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
