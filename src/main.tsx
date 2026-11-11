import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { store } from './app/store';
import { installTrace } from './features/follow-product/trace';
import '@fontsource-variable/urbanist';
import './styles.css';

if (import.meta.env.DEV) installTrace(() => store.session, store);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
