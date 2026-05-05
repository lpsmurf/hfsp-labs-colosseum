// Strategy: monitor token prices and alert when conditions are met
// TODO (Phase 2): implement using MCP client tools

export interface PriceAlert {
  token: string;
  condition: 'above' | 'below';
  targetPrice: number;
  notified: boolean;
}

export async function checkPriceAlerts(
  _alerts: PriceAlert[],
  _mcpUrl: string,
): Promise<string[]> {
  // TODO: call MCP tool getPrice for each alert
  // Return list of triggered alert messages
  return [];
}
