import React, { useState, useEffect } from 'react';

interface Tier {
  id: string;
  name: string;
  description: string;
  category: string;
  capability_bundle: string;
  features: string[];
  price_sol: number;
  price_herd: number;
}

interface TiersPageProps {
  onSelect: (tierId: string) => void;
}

export const TiersPage: React.FC<TiersPageProps> = ({ onSelect }) => {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Replace with real API call
    // const response = await fetch('/api/tiers');
    // const data = await response.json();
    // setTiers(data.tiers);

    // Mock data for now
    setTiers([
      {
        id: 'treasury-agent',
        name: 'Treasury Agent',
        description: 'AI-powered treasury management',
        category: 'treasury',
        capability_bundle: 'treasury-ops',
        features: ['balance-monitoring', 'cash-flow-management', 'yield-optimization'],
        price_sol: 5.0,
        price_herd: 500.0,
      },
      {
        id: 'travel-crypto-pro',
        name: 'Travel Crypto Pro',
        description: 'Travel-focused crypto agent',
        category: 'agent',
        capability_bundle: 'travel-crypto-pro',
        features: ['exchange-rates', 'payment-optimization', 'compliance-checks'],
        price_sol: 2.5,
        price_herd: 250.0,
      },
    ]);
    setLoading(false);
  }, []);

  if (loading) return <div className="loading">Loading tiers...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="tiers-page">
      <h2>Available Tiers</h2>
      <p className="subtitle">Select a tier to deploy your crypto agent</p>

      <div className="tiers-grid">
        {tiers.map(tier => (
          <div key={tier.id} className="tier-card">
            <div className="tier-header">
              <h3>{tier.name}</h3>
              <span className="category">{tier.category}</span>
            </div>

            <p className="description">{tier.description}</p>

            <div className="features">
              <strong>Features:</strong>
              <ul>
                {tier.features.map(feature => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>

            <div className="pricing">
              <div className="price">
                <span className="label">SOL</span>
                <span className="amount">{tier.price_sol} SOL</span>
              </div>
              <div className="price">
                <span className="label">HERD</span>
                <span className="amount">{tier.price_herd} HERD</span>
              </div>
            </div>

            <button 
              className="deploy-btn"
              onClick={() => onSelect(tier.id)}
            >
              Deploy This Tier
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
