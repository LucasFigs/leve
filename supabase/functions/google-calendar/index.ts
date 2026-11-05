import { createHandler } from './handler.ts';
declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
function required(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing configuration: ${key}`);
  return value;
}
Deno.serve(createHandler({
  supabaseUrl: required('SUPABASE_URL'), serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  clientId: required('GOOGLE_CLIENT_ID'), clientSecret: required('GOOGLE_CLIENT_SECRET'),
  encryptionKey: required('GOOGLE_TOKEN_ENCRYPTION_KEY'), appOrigin: required('GOOGLE_APP_ORIGIN'),
}));
