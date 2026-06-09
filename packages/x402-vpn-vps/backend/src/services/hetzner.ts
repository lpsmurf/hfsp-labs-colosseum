import env from "../config.js";
import { generateKeyPairSync } from "crypto";
import { classifyHetznerError } from "../errors.js";

const HETZNER_API = "https://api.hetzner.cloud/v1";

const REGION_LOCATION: Record<string, string> = {
  DE_NBG: "nbg1",
  FI_HEL: "hel1",
  US_HIL: "hil",
  SG_SIN: "sin",
};

// cx23: 2 vCPU, 4GB RAM, x86 — available in nbg1, hel1
// ccx13: 2 vCPU, 8GB RAM, x86 — available in nbg1, hel1, hil, sin
// cpx11: 2 vCPU, 2GB RAM, x86 — available in hil only
const SERVER_TYPE = "ccx13"; // available across all 4 active regions

export interface VpnServer {
  id:              number;
  ip:              string;
  serverWgPubKey:  string; // base64 — needed by client to complete their .conf
}

export interface VpsServer {
  id: number;
  ip: string;
  // SSH private key is NEVER returned — user generated it in their browser
  wireguardClientConf: string; // base64 — VPN access to the VPS (optional)
}

async function apiCall(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${HETZNER_API}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${env.HETZNER_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as any;
    const errCode = json?.error?.code ?? "unknown";
    const errMsg  = json?.error?.message ?? res.statusText;
    throw classifyHetznerError(errCode, errMsg, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Extract raw 32 bytes from a DER-encoded X25519 key (last 32 bytes in both PKCS8 and SPKI)
function x25519RawB64(derBuf: Buffer): string {
  return derBuf.subarray(-32).toString("base64");
}

function generateWireGuardKeypair(): { privB64: string; pubB64: string } {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const privDer = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const pubDer  = publicKey.export({  type: "spki",  format: "der" }) as Buffer;
  return { privB64: x25519RawB64(privDer), pubB64: x25519RawB64(pubDer) };
}

// VPN cloud-init:
// - Server WireGuard private key baked in (never stored anywhere else)
// - Client WireGuard public key added as peer
// - SSH port closed, password auth and pubkey auth both disabled — zero operator access
function vpnCloudInit(serverWgPriv: string, clientWgPub: string): string {
  return `#!/bin/bash
apt-get update -qq
apt-get install -y wireguard ufw iptables

# Firewall: WireGuard only — SSH port intentionally closed
ufw default deny incoming
ufw default allow outgoing
ufw allow 51820/udp
ufw --force enable

# Disable all SSH auth methods — no one can log in, including the operator
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication no/'    /etc/ssh/sshd_config
sed -i 's/^#*ChallengeResponse.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Enable IP forwarding
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -p

cat > /etc/wireguard/wg0.conf <<WGEOF
[Interface]
PrivateKey = ${serverWgPriv}
Address = 10.8.0.1/24
ListenPort = 51820
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = ${clientWgPub}
AllowedIPs = 10.8.0.2/32
WGEOF

chmod 600 /etc/wireguard/wg0.conf
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
`;
}

// VPS cloud-init:
// - User's SSH public key added to authorized_keys
// - Operator has NO private key — only the user does (key generated in their browser)
// - WireGuard installed for optional VPN access
function vpsCloudInit(userSshPub: string, serverWgPriv: string): string {
  return `#!/bin/bash
apt-get update -qq
apt-get install -y wireguard ufw iptables openssh-server

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 51820/udp
ufw --force enable

# Only allow key-based SSH — the user's key, not ours
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/'       /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/'         /etc/ssh/sshd_config
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/'     /etc/ssh/sshd_config

mkdir -p /root/.ssh
echo "${userSshPub}" > /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
chown -R root:root /root/.ssh
systemctl restart sshd

# Enable IP forwarding
echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
sysctl -p

cat > /etc/wireguard/wg0.conf <<WGEOF
[Interface]
PrivateKey = ${serverWgPriv}
Address = 10.9.0.1/24
ListenPort = 51820
PostUp   = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
WGEOF

chmod 600 /etc/wireguard/wg0.conf
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
`;
}

// VPN: operator generates server WireGuard keypair in memory — private key goes into
// cloud-init user-data (accessible only from inside the server via metadata endpoint),
// never stored anywhere else. Client WireGuard public key (browser-generated) is added
// as the only peer. SSH is completely disabled on this server.
export async function createVpnServer(region: string, clientWgPubKey: string): Promise<VpnServer> {
  const location = REGION_LOCATION[region] ?? "fsn1";
  const { privB64, pubB64 } = generateWireGuardKeypair();

  const data = await apiCall("/servers", "POST", {
    name:        `vpn-x402-${Date.now()}`,
    server_type: SERVER_TYPE,
    image:       "ubuntu-24.04",
    location,
    user_data:   vpnCloudInit(privB64, clientWgPubKey),
    public_net:  { enable_ipv4: true, enable_ipv6: false },
  });

  // Server WireGuard private key is now only in the cloud-init of the provisioned server.
  // We return only the public key so the user can complete their client config.
  return {
    id:             data.server.id as number,
    ip:             data.server.public_net.ipv4.ip as string,
    serverWgPubKey: pubB64,
  };
}

// VPS: user generates SSH keypair in browser, sends only the public key here.
// We never see the private key. WireGuard is also set up server-side with an
// in-memory keypair — user gets the server WG public key to optionally configure
// a VPN tunnel to their VPS.
export async function createVpsServer(region: string, userSshPubKey: string): Promise<VpsServer> {
  const location = REGION_LOCATION[region] ?? "fsn1";
  const { privB64: vpsWgPriv, pubB64: vpsWgPub } = generateWireGuardKeypair();

  const data = await apiCall("/servers", "POST", {
    name:        `vps-x402-${Date.now()}`,
    server_type: SERVER_TYPE,
    image:       "ubuntu-24.04",
    location,
    user_data:   vpsCloudInit(userSshPubKey, vpsWgPriv),
    public_net:  { enable_ipv4: true, enable_ipv6: false },
  });

  const ip = data.server.public_net.ipv4.ip as string;

  // Client WireGuard config template for the VPS — user still needs to generate
  // their own WireGuard client keypair to use this. The server pub key is returned.
  const wgConf = `[Interface]
PrivateKey = <your-client-wireguard-private-key>
Address = 10.9.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = ${vpsWgPub}
Endpoint = ${ip}:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;

  return {
    id:                  data.server.id as number,
    ip,
    wireguardClientConf: Buffer.from(wgConf, "utf8").toString("base64"),
  };
}

export async function deleteServer(serverId: number): Promise<void> {
  await apiCall(`/servers/${serverId}`, "DELETE");
}
