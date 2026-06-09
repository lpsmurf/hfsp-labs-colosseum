import type { X402Transaction } from '@/lib/types';
import { formatUsdc, formatDate, productLabel, formatAddress } from '@/lib/utils';
import { CheckCircle, Clock, XCircle, ExternalLink } from 'lucide-react';

const statusIcon = {
  success: <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
  pending: <Clock className="h-3.5 w-3.5 text-yellow-400" />,
  failed:  <XCircle className="h-3.5 w-3.5 text-red-400" />,
};

interface Props { transactions: X402Transaction[] }

export function TxTable({ transactions }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-sm text-muted-foreground">No transactions yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Status</th>
            <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Product</th>
            <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Amount</th>
            <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Time</th>
            <th className="text-left text-xs text-muted-foreground font-medium px-4 py-2.5">Sig</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.map(tx => (
            <tr key={tx.id} className="hover:bg-accent/30 transition-colors">
              <td className="px-4 py-2.5">{statusIcon[tx.status]}</td>
              <td className="px-4 py-2.5">
                <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {productLabel(tx.product)}
                </span>
              </td>
              <td className="px-4 py-2.5 font-medium text-foreground">{formatUsdc(tx.amountUsdc)}</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDate(tx.blockTime)}</td>
              <td className="px-4 py-2.5">
                <a
                  href={`https://solscan.io/tx/${tx.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-mono"
                >
                  {formatAddress(tx.signature)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
