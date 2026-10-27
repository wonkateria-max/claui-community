import { createTelegramHandler } from './handler.ts';
Deno.serve(createTelegramHandler({env:name=>Deno.env.get(name)}));
