"use client";

export interface WireGuardKeypair {
  privateKey: string; // base64 raw X25519 — stays in browser
  publicKey:  string; // base64 raw X25519 — sent to backend
}

export interface SSHKeypair {
  privateKeyPem:   string; // OpenSSH private key PEM — stays in browser
  publicKeyOpenSSH: string; // "ssh-ed25519 ..." — sent to backend
}

// ─── WireGuard (X25519) ───────────────────────────────────────────────────────

export async function generateWireGuardKeypair(): Promise<WireGuardKeypair> {
  const kp = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveKey"]);
  const privRaw = await crypto.subtle.exportKey("raw", kp.privateKey);
  const pubRaw  = await crypto.subtle.exportKey("raw", kp.publicKey);
  return {
    privateKey: toBase64(privRaw),
    publicKey:  toBase64(pubRaw),
  };
}

export function buildWireGuardClientConf(params: {
  clientPrivateKey: string; // base64
  serverPublicKey:  string; // base64
  serverIp:         string;
  clientAddress?:   string; // default 10.8.0.2/24
}): string {
  const addr = params.clientAddress ?? "10.8.0.2/24";
  return `[Interface]
PrivateKey = ${params.clientPrivateKey}
Address = ${addr}
DNS = 1.1.1.1

[Peer]
PublicKey = ${params.serverPublicKey}
Endpoint = ${params.serverIp}:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;
}

// ─── SSH (Ed25519) ────────────────────────────────────────────────────────────

export async function generateSSHKeypair(): Promise<SSHKeypair> {
  const kp = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  const privPkcs8 = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const pubSpki   = await crypto.subtle.exportKey("spki",  kp.publicKey);

  // Raw Ed25519 key bytes: last 32 bytes of PKCS8/SPKI DER blobs
  const privRaw = new Uint8Array(privPkcs8).slice(-32);
  const pubRaw  = new Uint8Array(pubSpki).slice(-32);

  return {
    privateKeyPem:    buildOpenSSHPrivateKey(privRaw, pubRaw),
    publicKeyOpenSSH: buildOpenSSHPublicKey(pubRaw),
  };
}

// ─── OpenSSH format helpers ───────────────────────────────────────────────────

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function lenPrefixed(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  new DataView(out.buffer).setUint32(0, data.length, false);
  out.set(data, 4);
  return out;
}

function str2bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function buildOpenSSHPublicKey(pubRaw: Uint8Array): string {
  const type = str2bytes("ssh-ed25519");
  const wire = new Uint8Array([...lenPrefixed(type), ...lenPrefixed(pubRaw)]);
  return `ssh-ed25519 ${toBase64(wire)} x402-vpn-vps`;
}

function buildOpenSSHPrivateKey(privRaw: Uint8Array, pubRaw: Uint8Array): string {
  const type    = str2bytes("ssh-ed25519");
  const none    = str2bytes("none");
  const comment = str2bytes("x402-vpn-vps");

  // Public key wire format (used twice: in public section and private section)
  const pubWire = new Uint8Array([...lenPrefixed(type), ...lenPrefixed(pubRaw)]);

  // Private key blob: ed25519 private key in OpenSSH format is privRaw || pubRaw (64 bytes total)
  const privFull = new Uint8Array([...privRaw, ...pubRaw]);

  // Check integers (random, same value = no passphrase)
  const check = new Uint8Array([0x12, 0x34, 0x56, 0x78]);

  const privateSection = new Uint8Array([
    ...check, ...check,
    ...lenPrefixed(type),
    ...lenPrefixed(pubRaw),
    ...lenPrefixed(privFull),
    ...lenPrefixed(comment),
    0x01, 0x02, 0x03, // padding to 8-byte boundary
  ]);

  const body = new Uint8Array([
    ...str2bytes("openssh-key-v1\0"),
    ...lenPrefixed(none),           // cipher: none
    ...lenPrefixed(none),           // kdf: none
    ...lenPrefixed(new Uint8Array(0)), // kdf options: empty
    0x00, 0x00, 0x00, 0x01,         // number of keys: 1
    ...lenPrefixed(pubWire),         // public key
    ...lenPrefixed(privateSection),  // private key blob
  ]);

  const b64 = toBase64(body).match(/.{1,70}/g)!.join("\n");
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${b64}\n-----END OPENSSH PRIVATE KEY-----\n`;
}
