import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';

const raiz = document.getElementById('raiz');
if (raiz === null) throw new Error('No se encontró el nodo raíz.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
