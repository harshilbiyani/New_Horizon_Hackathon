import { useState, useRef, useEffect } from 'react';
import { Radio, Activity } from 'lucide-react';

interface OpeningVideoProps {
  onComplete?: () => void;
  autoCloseOnEnd?: boolean;
}

export default function OpeningVideo({ onComplete, autoCloseOnEnd = true }: OpeningVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch((err) => {
        console.warn("Autoplay fallback:", err);
      });
    }
  }, []);

  const triggerClose = () => {
    if (isFadingOut) return;
    setIsFadingOut(true);
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 600);
  };

  return (
    <div
      onClick={triggerClose}
      className={`fixed inset-0 z-[99999] bg-black flex items-center justify-center cursor-pointer transition-opacity duration-700 select-none overflow-hidden ${isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src="/opening_reveal.mp4"
        className="w-full h-full object-cover pointer-events-none"
        autoPlay
        playsInline
        muted
        onEnded={triggerClose}
      />

      {/* Embedded Brand Header (Perfectly sized and centered inside the video's built-in HUD box frame) */}
      <div className="absolute top-[4.5%] left-1/2 transform -translate-x-1/2 w-[84%] max-w-[1200px] h-[18%] z-30 pointer-events-none flex items-center justify-center gap-6 px-6">
        {/* Official Drone Shield Logo */}
        <img
          src="/logo.png"
          alt="Drone Shield Official Logo"
          className="h-16 md:h-20 w-auto object-contain filter drop-shadow-[0_0_20px_#00ffcc] shrink-0"
        />

        {/* Brand Typography Embedded directly inside the HUD box space */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-3">
            <span className="text-3xl md:text-5xl font-extrabold tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-[#00ffcc] via-white to-[#00e5ff] drop-shadow-[0_0_25px_rgba(0,255,204,1)] font-sans uppercase">
              DRONE SHIELD
            </span>
            <span className="bg-[#00ffcc] text-black font-black text-xs md:text-sm px-3 py-1 rounded-full uppercase tracking-wider shadow-[0_0_15px_#00ffcc] shrink-0">
              v2.0 LIVE
            </span>
          </div>

          <p className="text-xs md:text-sm font-mono tracking-[0.3em] text-cyan-300 font-extrabold uppercase mt-1 flex items-center gap-2 drop-shadow-[0_0_10px_#00ffcc]">
            <Radio className="w-4 h-4 text-[#00ffcc] animate-pulse" />
            AUTONOMOUS SWARM DEFENSE & RESCUE MATRIX
          </p>
        </div>
      </div>

      {/* Bottom Right Corner: Drone Shield LOGO ONLY directly on top of Gemini Watermark Star */}
      <div className="absolute bottom-[75px] right-[100px] md:bottom-[85px] md:right-[155px] z-40 pointer-events-none bg-black/95 backdrop-blur-2xl p-2.5 rounded-full border-2 border-[#00ffcc] shadow-[0_0_40px_rgba(0,255,204,1)] flex items-center justify-center transform translate-x-1/2 translate-y-1/2">
        <img
          src="/logo.png"
          alt="Drone Shield Logo Watermark Mask"
          className="w-20 h-20 md:w-24 md:h-24 object-contain filter drop-shadow-[0_0_20px_#00ffcc]"
        />
      </div>

      {/* Bottom Launch Indicator */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 bg-black/80 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 text-xs md:text-sm text-gray-200 font-mono shadow-2xl">
        <Activity className="w-4 h-4 text-[#00ffcc] animate-spin" />
        <span>CLICK ANYWHERE TO PROCEED TO DASHBOARD</span>
      </div>
    </div>
  );
}
