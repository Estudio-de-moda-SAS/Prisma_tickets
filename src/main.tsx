import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { GraphServicesProvider } from '@/graph/GraphServicesProvider';
import App from '@/App';
import './styles/globals.css';

// Aplica el tema guardado antes del primer render (evita flash)
// Default: light
const saved = localStorage.getItem('prisma-theme');
let initialTheme = 'light';
if (saved) {
  try {
    const parsed = JSON.parse(saved)?.state?.theme;
    if (parsed === 'dark' || parsed === 'light') initialTheme = parsed;
  } catch { /* silent */ }
}
document.documentElement.setAttribute('data-theme', initialTheme);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:   15_000,
      retry:       1,
      retryDelay:  (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró #root en el HTML');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GraphServicesProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </GraphServicesProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);