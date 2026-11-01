import './lib/api';
import {createRoot} from 'react-dom/client';
import {lazy, Suspense} from 'react';
import './index.css';

const App = lazy(() => import('./App.tsx'));

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div style={{ minHeight: '100vh', background: '#14120f' }} />}>
    <App />
  </Suspense>,
);
