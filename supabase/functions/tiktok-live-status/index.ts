import { createHandler } from './status.ts';

Deno.serve(createHandler({ env: name => Deno.env.get(name) }));
