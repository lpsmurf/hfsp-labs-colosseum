import net from 'node:net';
import type Database from 'better-sqlite3';
import { validateSession, addBytes } from './db.js';

export function startProxy(port: number, db: Database.Database): net.Server {
  const server = net.createServer((client) => {
    let buf = Buffer.alloc(0);
    let tunnelReady = false;

    client.on('data', (chunk) => {
      if (tunnelReady) return;
      buf = Buffer.concat([buf, chunk]);

      const sep = buf.indexOf('\r\n\r\n');
      if (sep === -1) return; // headers not yet complete

      tunnelReady = true;
      const afterHeaders = buf.slice(sep + 4);
      const headerBlock = buf.slice(0, sep).toString('utf8');
      const lines = headerBlock.split('\r\n');

      const connectMatch = lines[0]?.match(/^CONNECT\s+([^:\s]+):(\d+)\s+HTTP\/1\.[01]$/i);
      if (!connectMatch) {
        client.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        client.destroy();
        return;
      }

      const authLine = lines.find(l => /^proxy-authorization:/i.test(l));
      const token = authLine?.match(/Bearer\s+(\S+)/i)?.[1] ?? null;
      const session = token ? validateSession(db, token) : null;

      if (!session) {
        client.write(
          'HTTP/1.1 407 Proxy Authentication Required\r\n' +
          'Proxy-Authenticate: Bearer realm="clawdrop-vpn"\r\n' +
          'Content-Length: 0\r\n' +
          '\r\n',
        );
        client.destroy();
        return;
      }

      const targetHost = connectMatch[1];
      const targetPort = parseInt(connectMatch[2]);

      const remote = net.connect(targetPort, targetHost, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');

        // Flush any data that arrived in the same TCP packet as the CONNECT headers
        if (afterHeaders.length > 0) {
          remote.write(afterHeaders);
          if (token) addBytes(db, token, afterHeaders.length);
        }

        client.removeAllListeners('data');

        remote.on('data', (d) => {
          client.write(d);
          if (token) addBytes(db, token, d.length);
        });
        client.on('data', (d) => {
          remote.write(d);
          if (token) addBytes(db, token, d.length);
        });
      });

      remote.on('error', () => {
        if (!client.destroyed) {
          client.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
          client.destroy();
        }
      });
      client.on('close', () => remote.destroy());
      remote.on('close', () => client.destroy());
    });

    client.on('error', () => client.destroy());
  });

  server.listen(port, () => console.log(`[vpn] CONNECT proxy listening on :${port}`));
  return server;
}
