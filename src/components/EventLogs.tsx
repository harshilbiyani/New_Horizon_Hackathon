import { format } from 'date-fns';
import type { Alert } from '../types/telemetry';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

export default function EventLogs({ alerts }: { alerts: Alert[] }) {
  const [filter, setFilter] = useState<string>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [alerts, filter]);

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'ALL') return true;
    if (filter === 'CRITICAL' && alert.type === 'critical') return true;
    if (filter === 'OBSTACLE' && alert.type === 'warning' && alert.message.includes('obstacle')) return true;
    if (filter === 'CLOUDINARY' && alert.message.includes('Cloudinary')) return true;
    if (filter === 'TELEMETRY' && alert.type === 'info') return true;
    return false;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide text-xs">
        {['ALL', 'CRITICAL', 'OBSTACLE', 'CLOUDINARY', 'TELEMETRY'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded border whitespace-nowrap ${
              filter === f ? 'bg-[#00ffcc] text-black border-[#00ffcc] font-bold' : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 bg-[#050b14] rounded-md p-3 font-mono text-sm shadow-inner scrollbar-thin scrollbar-thumb-white/10">
        <AnimatePresence>
          {filteredAlerts.map((alert) => (
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
        {filteredAlerts.length === 0 && (
          <div className="text-gray-600 italic">No logs found for filter: {filter}</div>
        )}
      </div>
    </div>
  );
}