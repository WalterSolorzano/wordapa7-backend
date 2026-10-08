import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export function log(level: 'info' | 'warn' | 'error' | 'debug', module: string, msg: string, meta?: any) {
  const logPath = path.join(app.getPath('userData'), 'debug.log');
  const entry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    meta
  };
  
  const line = JSON.stringify(entry) + '\n';
  
  // Escribir al archivo (append)
  try {
    fs.appendFileSync(logPath, line);
  } catch (e) {
    console.error('No se pudo escribir en debug.log', e);
  }
  
  // También imprimir en consola estándar para dev
  console[level === 'debug' ? 'log' : level](`[${level.toUpperCase()}] [${module}] ${msg}`, meta ? meta : '');
}
