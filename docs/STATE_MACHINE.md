# Tenant state machine (beta)

## Tenant.status
- draft
- provisioning
- waiting_oauth
- oauth_connected
- waiting_api_key
- ready_waiting_pair
- live
- suspended
- cancelled

## Connect method
- api_key
- oauth
- oauth_then_api_key

## Transitions (happy path)
- draft → provisioning (after token + template + connect method selected)
- provisioning → waiting_oauth (if oauth)
- waiting_oauth → oauth_connected (web callback success)
- oauth_connected → ready_waiting_pair (gateway started)
- ready_waiting_pair → live (pairing approved)

## Fallback path
- waiting_oauth → waiting_api_key (oauth failure/timeout)
- waiting_api_key → provisioning (api key received)

## Timeouts
- waiting_oauth: 10 min then fallback
- provisioning: 5 min then mark failed + show retry
