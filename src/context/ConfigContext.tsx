import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useConfig, DEFAULT_CONFIG } from '../hooks/useConfig';
import type { SimConfig } from '../hooks/useConfig';

export const ConfigContext = createContext<SimConfig>(DEFAULT_CONFIG);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useSimConfig(): SimConfig {
  return useContext(ConfigContext);
}
