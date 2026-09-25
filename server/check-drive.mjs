import { Drive } from './drive.mjs';
process.loadEnvFile('.env');
const required=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','GOOGLE_DRIVE_FOLDER_ID','MEMORIES_SESSION_KEY'];
if(required.some(k=>!process.env[k]))throw new Error('Falta completar la configuración local.');
try {
  await new Drive(process.env).ready();
  console.log('Drive conectado y carpeta privada verificada.');
} catch {
  console.error('No se pudo verificar la conexión o la privacidad de la carpeta.');
  process.exitCode=1;
}
