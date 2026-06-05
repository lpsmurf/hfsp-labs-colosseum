import Link from 'next/link';
import { LayoutDashboard, Bot, Wallet, Zap } from 'lucide-react';

const NAV = [
  { href: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/agents',  icon: Bot,             label: 'Agents' },
  { href: '/skills',  icon: Zap,             label: 'Skills' },
  { href: '/wallet',  icon: Wallet,          label: 'Wallet' },
];

export function Sidebar() {
  return (
    <aside className="w-52 shrink-0 border-r border-border bg-card flex flex-col py-6 px-3">
      <div className="px-3 mb-8">
        <span className="text-primary font-bold text-sm tracking-wide">x402 WALLET</span>
        <p className="text-muted-foreground text-[10px] mt-0.5">Agent Control Plane</p>
      </div>
      <nav className="flex-1 space-y-1">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="px-3 pt-4 border-t border-border">
        <p className="text-[10px] text-muted-foreground">Clawdrop · x402</p>
      </div>
    </aside>
  );
}
