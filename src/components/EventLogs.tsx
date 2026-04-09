import { format } from 'date-fns';
import type { Alert } from '../types/telemetry';
import { motion, AnimatePresence } from 'framer-motion';

export default function EventLogs({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="flex-1 overflow-y-auto pr-2 bg-[#050b14] rounded-md p-3 font-mono text-sm shadow-inner scrollbar-thin scrollbar-thumb-white/10">
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-2 pb-2 border-b border-white/5 break-words max-w-full"
          >
            <span className="text-gray-500 mr-2 shrink-0 select-none">
              [{format(new Date(alert.timestamp), 'HH:mm:ss')}]
            </span>
            <span
              className={`font-semibold shrink-0 select-none mr-2 ${
                alert.type === 'critical' ? 'text-red-500' : alert.type === 'warning' ? 'text-yellow-400' : 'text-[#00ffcc]'
              }`}
            >
              {alert.type.toUpperCase()}
            </span>
            <span className="text-gray-300 break-normal break-words">{alert.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      {alerts.length === 0 && (
        <div className="text-gray-600 italic">System Initialized. Awaiting telemetry logs...</div>
      )}
    </div>
  );
}