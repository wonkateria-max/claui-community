import { createCommunityHandler } from './handler.ts';
Deno.serve(createCommunityHandler({ env: name => Deno.env.get(name) }));
