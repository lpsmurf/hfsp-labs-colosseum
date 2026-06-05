import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsdc(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function formatDate(ts: number): string {
  return new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function productLabel(product: string): string {
  const labels: Record<string, string> = {
    'vpn-x402':    'VPN',
    'gnosis-card': 'Gnosis Card',
    'vps-x402':    'VPS',
    'custom':      'Custom',
    'marketplace': 'Marketplace',
    'unknown':     'Unknown',
  };
  return labels[product] ?? product;
}
