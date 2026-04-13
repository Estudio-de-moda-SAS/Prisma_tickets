import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { GraphServicesProvider } from '@/graph/GraphServicesProvider';
import App from '@/App';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:   15_000,
      retry:       1,
      // No reintenta en errores 4xx (credenciales, permisos) — solo en 5xx
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
      {/* AuthProvider primero: GraphServicesProvider depende de useAuth */}
      <AuthProvider>
        <GraphServicesProvider>
          {/* QueryClient después de los servicios: los hooks de query usan useGraphServices */}
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </GraphServicesProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);