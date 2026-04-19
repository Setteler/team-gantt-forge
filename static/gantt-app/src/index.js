import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { view } from '@forge/bridge';
import App from './App';
import GadgetMode from './components/GadgetMode';
import './styles.css';

// Detect context BEFORE rendering App or GadgetMode.
// Each component has its own stable hooks — no conditional hook violation.
function Root() {
  const [mode, setMode] = useState('loading');

  useEffect(() => {
    view.getContext()
      .then(ctx => {
        setMode(ctx?.extension?.type === 'jira:dashboardGadget' ? 'gadget' : 'app');
      })
      .catch(() => setMode('app'));
  }, []);

  if (mode === 'loading') return null;
  if (mode === 'gadget') return <GadgetMode />;
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
