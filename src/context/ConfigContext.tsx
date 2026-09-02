import { createContext, useContext, ReactNode } from 'react';
import { useConfig, SimConfig, DEFAULT_CONFIG } from '../hooks/useConfig';

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
