export interface EndaomentDeployment {
  chainId:         number;
  contractAddress: string;
  usdcBalance:     string;
  isDeployed:      boolean;
}

export interface EndaomentOrg {
  id:                        string;
  ein:                       string | null;
  name:                      string;
  description:               string;
  logo:                      string;
  nteeCode:                  string;
  nteeDescription:           string;
  isCompliant:               boolean;
  lifetimeContributionsUsdc: string;
  donationsReceived:         number;
  deployments:               EndaomentDeployment[];
  website:                   string;
}

export interface Charity {
  id:          string;   // Endaoment UUID
  slug:        string;   // url-safe name
  ein:         string | null;
  name:        string;
  description: string;
  logo:        string;
  category:    string;
  website:     string;
  baseAddress: string;   // Base chain contract address (payTo)
  isDeployed:  boolean;
  totalRaisedUsdc: number;
  fees: {
    endaomentAdminPct: number;
    servicePct:        number;
    gasEstimateUsd:    number;
    note:              string;
  };
}

export interface DonationReceipt {
  charityId:        string;
  charityName:      string;
  baseAddress:      string;
  txHash:           string;
  routeTxHash:      string | null;
  paidUsdc:         number;
  netToCharityUsdc: number;
  timestamp:        string;
}
