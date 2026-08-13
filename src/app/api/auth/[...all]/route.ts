import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/server';

// No `export const runtime` here: nextConfig.cacheComponents forbids the route
// segment config entirely, which means no route in this app can opt into the
// Edge runtime. Node is the default and is now structurally guaranteed —
// important for the WhatsApp webhook, whose HMAC needs node:crypto over the
// raw request body.
export const { GET, POST } = toNextJsHandler(auth.handler);
