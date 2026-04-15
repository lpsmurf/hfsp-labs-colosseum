import React, { useState } from 'react';
import { TiersPage } from './pages/Tiers';
import { DeployPage } from './pages/Deploy';
import { StatusPage } from './pages/Status';

type Page = 'tiers' | 'deploy' | 'status';

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('tiers');
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="header">
        <h1>🦅 Clawdrop MCP Gateway</h1>
        <nav className="nav">
          <button 
            onClick={() => setCurrentPage('tiers')}
            className={currentPage === 'tiers' ? 'active' : ''}
          >
            Browse Tiers
          </button>
          <button 
            onClick={() => setCurrentPage('deploy')}
            className={currentPage === 'deploy' ? 'active' : ''}
          >
            Deploy Agent
          </button>
          {deploymentId && (
            <button 
              onClick={() => setCurrentPage('status')}
              className={currentPage === 'status' ? 'active' : ''}
            >
              Deployment Status
            </button>
          )}
        </nav>
      </header>

      <main className="main">
        {currentPage === 'tiers' && (
          <TiersPage 
            onSelect={(tierId) => {
              setSelectedTierId(tierId);
              setCurrentPage('deploy');
            }}
          />
        )}

        {currentPage === 'deploy' && (
          <DeployPage 
            selectedTierId={selectedTierId}
            onDeploymentCreated={(depId) => {
              setDeploymentId(depId);
              setCurrentPage('status');
            }}
          />
        )}

        {currentPage === 'status' && deploymentId && (
          <StatusPage deploymentId={deploymentId} />
        )}
      </main>

      <footer className="footer">
        <p>Clawdrop MCP Gateway • Deploy crypto agents with one click</p>
      </footer>
    </div>
  );
};

export default App;
