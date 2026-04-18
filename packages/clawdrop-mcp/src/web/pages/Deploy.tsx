import React, { useState } from 'react';

interface DeployPageProps {
  selectedTierId: string | null;
  onDeploymentCreated: (deploymentId: string) => void;
}

export const DeployPage: React.FC<DeployPageProps> = ({ 
  selectedTierId, 
  onDeploymentCreated 
}) => {
  const [agentName, setAgentName] = useState('');
  const [region, setRegion] = useState('us-east');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // TODO: Replace with real API call
      // const response = await fetch('/api/deploy', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     tier_id: selectedTierId,
      //     agent_name: agentName,
      //     region: region,
      //   }),
      // });
      // const data = await response.json();
      // onDeploymentCreated(data.deployment_id);

      // Mock deployment
      const mockDeploymentId = `deploy_${Date.now()}`;
      onDeploymentCreated(mockDeploymentId);
    } catch (err) {
      setError('Failed to deploy. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="deploy-page">
      <h2>Deploy Agent</h2>

      <form onSubmit={handleDeploy} className="deploy-form">
        <div className="form-group">
          <label>Selected Tier</label>
          <input 
            type="text" 
            value={selectedTierId || ''} 
            disabled 
            className="input-disabled"
          />
        </div>

        <div className="form-group">
          <label htmlFor="agentName">Agent Name</label>
          <input
            id="agentName"
            type="text"
            placeholder="e.g., my-treasury-agent"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            required
            className="input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="region">Region</label>
          <select 
            id="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="input"
          >
            <option value="us-east">US East</option>
            <option value="us-west">US West</option>
            <option value="eu-west">EU West</option>
            <option value="ap-southeast">AP Southeast</option>
          </select>
        </div>

        <div className="form-group">
          <label>
            <input type="checkbox" required />
            I have a valid Solana devnet wallet with test SOL
          </label>
        </div>

        {error && <div className="error">{error}</div>}

        <button 
          type="submit" 
          disabled={loading}
          className="deploy-btn primary"
        >
          {loading ? 'Deploying...' : 'Deploy Agent'}
        </button>
      </form>
    </div>
  );
};
