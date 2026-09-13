import type { Request, Response } from 'express';
import { ExpressAdapter } from '@x402/express';
import { x402HTTPResourceServer, type x402ResourceServer, type RouteConfig, type HTTPResponseInstructions } from '@x402/core/server';
import type { PaymentOption } from '@x402/core/http';

export interface SettledPayment {
  transaction: string;
  network: string;
  amount: string;
  payer?: string;
}

/**
 * For fulfillment that spends money: settle before invoking the business handler.
 *
 * This is the x402 V2 `upfront` payment flow (spec §6.1: settle → resource →
 * respond), which `exact` on EVM supports. The spec requires a non-default flow
 * to be declared in `accepts[].extra.paymentFlow`, so clients can see that funds
 * commit before the resource runs — this gate stamps it on every option rather
 * than trusting each caller to remember. The SDK then settles inside
 * `processHTTPRequest`; calling `processSettlement` again would only echo that
 * result.
 *
 * Under `upfront` a handler failure leaves the client charged with nothing
 * delivered, and the spec defines no refund: the caller owns reconciliation.
 * The caller validates the order and supplies its price, never a client price.
 * A separate durable order claim must guard irreversible fulfillment.
 */
export function createPrepaidGate(server: x402ResourceServer) {
  let initialization: Promise<void> | undefined;
  return async (req: Request, res: Response, route: RouteConfig): Promise<SettledPayment | null> => {
    initialization ??= server.initialize().catch(error => {
      initialization = undefined;
      throw error;
    });
    await initialization;
    const http = new x402HTTPResourceServer(server, withUpfrontFlow(route));
    const adapter = new ExpressAdapter(req);
    const context = {
      adapter, path: req.path, method: req.method,
      paymentHeader: adapter.getHeader('payment-signature'),
    };
    const send = (response: HTTPResponseInstructions) => {
      res.set('Cache-Control', 'no-store').set(response.headers).status(response.status);
      if (response.isHtml) res.send(response.body);
      else res.json(response.body ?? {});
    };
    const result = await http.processHTTPRequest(context);
    if (result.type === 'payment-error') { send(result.response); return null; }
    if (result.type !== 'payment-verified') throw new Error('Payment gate did not protect this request');

    const settled = result.beforeHandlerSettlement;
    // Invariant from the flow table: upfront always settles before the handler.
    // Refuse to run fulfillment on a payment that was only verified.
    if (!settled?.result.success || !settled.result.transaction) {
      throw new Error('Upfront payment flow returned without a completed settlement');
    }
    res.set(http.createCompletedSettlementHeaders(settled, res.get('Cache-Control')));
    return {
      transaction: settled.result.transaction,
      network: settled.result.network,
      amount: result.paymentRequirements.amount,
      ...(settled.result.payer ? { payer: settled.result.payer } : {}),
    };
  };
}

function withUpfrontFlow(route: RouteConfig): RouteConfig {
  const options = Array.isArray(route.accepts) ? route.accepts : [route.accepts];
  return {
    ...route,
    accepts: options.map((option: PaymentOption) => ({
      ...option,
      extra: { ...option.extra, paymentFlow: 'upfront' },
    })),
  };
}
