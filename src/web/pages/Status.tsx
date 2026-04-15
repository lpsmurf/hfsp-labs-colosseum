import React, { useState, useEffect } from 'react';

interface Deployment {
  deployment_id: string;
  agent_id: string;
  status: 'provisioning' | 'running' | 'failed' | 'stopped';
  uptime_seconds: number;
  endpoint?: string;
  logs: Array<{ timestamp: string; level: string; message: string }>;
}

interface StatusPageProps {
  deploymentId: string;
}

export const StatusPage: React.FC<StatusPageProps> = ({ deploymentId }) => {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // TODO: Replace with real API call
        // const response = await fetch(`/api/deployment/${deploymentId}`);
        // const data = await response.json();
        // setDeployment(data);

        // Mock status
        setDeployment({
          deployment_id: deploymentId,
          agent_id: `agent_${Date.now()}`,
          status: 'provisioning',
          uptime_seconds: 0,
          endpoint: `https://agent-${deploymentId}.clawdrop.live`,
          logs: [
            { timestamp: new Date().toISOString(), level: 'info', message: 'Deployment started' },
          ],
        });
      } catch (err) {
        setError('Failed to fetch deployment status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [deploymentId, autoRefresh]);

  if (loading) return <div className="loading">Loading status...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!deployment) return <div className="error">Deployment not found</div>;

  const statusColor = {
    provisioning: '#FFA500',
    running: '#00FF00',
    failed: '#FF0000',
    stopped: '#808080',
  }[deployment.status];

  return (
    <div className="status-page">
      <h2>Deployment Status</h2>

      <div className="status-card">
        <div className="status-header">
          <h3>{deployment.deployment_id}</h3>
          <div className="status-badge" style={{ backgroundColor: statusColor }}>
            {deployment.status.toUpperCase()}
          </div>
        </div>

        <div className="status-details">
          <div className="detail">
            <span className="label">Agent ID:</span>
            <span>{deployment.agent_id}</span>
          </div>

          <div className="detail">
            <span className="label">Uptime:</span>
            <span>{deployment.uptime_seconds}s</span>
          </div>

          {deployment.endpoint && (
            <div className="detail">
              <span className="label">Endpoint:</span>
              <a href={deployment.endpoint} target="_blank" rel="noopener noreferrer">
                {deployment.endpoint}
              </a>
            </div>
          )}
        </div>

        <div className="logs">
          <h4>Logs</h4>
          <div className="log-viewer">
            {deployment.logs.map((log, idx) => (
              <div key={idx} className={`log-entry ${log.level}`}>
                <span className="timestamp">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="level">[{log.level.toUpperCase()}]</span>
                <span className="message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="controls">
          <label>
            <input 
              type="checkbox" 
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh every 5 seconds
          </label>
        </div>

        {deployment.status === 'running' && (
          <div className="success-message">
            <h4>✅ Agent is ready!</h4>
            <p>You can now connect Claude Code to this agent's MCP endpoint.</p>
            <code>{deployment.endpoint}/mcp</code>
          </div>
        )}
      </div>
    </div>
  );
};
