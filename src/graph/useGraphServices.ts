import * as React from 'react';
import type { GraphServices } from './GraphServicesProvider';

export const GraphServicesContext = React.createContext<GraphServices | null>(null);

export function useGraphServices(): GraphServices {
  const ctx = React.useContext(GraphServicesContext);
  if (!ctx) {
    throw new Error(
      'useGraphServices debe usarse dentro de <GraphServicesProvider>.',
    );
  }
  return ctx;
}