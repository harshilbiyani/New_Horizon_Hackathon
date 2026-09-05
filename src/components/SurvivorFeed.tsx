import { format } from 'date-fns';
import type { Survivor } from '../types/telemetry';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair } from 'lucide-react';

export default function SurvivorFeed({ survivors }: { survivors: Survivor[] }) {
  return (
    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      <AnimatePresence>
        {survivors.map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="p-3 bg-red-500/10 border-l-2 border-red-500 rounded-r-md backdrop-blur-sm"
          >
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <Crosshair size={14} className="animate-pulse" />
                Target Found
              </div>
              <span className="text-xs text-gray-500 font-mono">
                {format(new Date(s.timestamp), 'HH:mm:ss.SSS')}
              </span>
            </div>
            <div className="grid grid-cols-2 text-xs font-mono text-gray-300">
              <div className="text-left w-full"><span className="text-gray-500">ID:</span> {s.id.split('-').pop()}</div>
              <div className="text-right w-full"><span className="text-gray-500">CONF:</span> {(s.confidence * 100).toFixed(0)}%</div>
              <div className="col-span-2 text-[#00ffcc] w-full text-right mt-1">
                [X: {s.x.toFixed(1)}, Y: {s.y.toFixed(1)}]
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {survivors.length === 0 && (
        <div className="text-center text-gray-500 italic mt-8">No survivors detected yet.</div>
      )}
    </div>
  );
}