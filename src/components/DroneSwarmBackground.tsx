import React from 'react';

export default function DroneSwarmBackground() {
  const drones = [
    { id: 1, top: '8%', left: '5%', scale: 0.95, delay: '0s', duration: '6.5s', heading: 15 },
    { id: 2, top: '14%', right: '6%', scale: 0.9, delay: '1.2s', duration: '8.5s', heading: -22 },
    { id: 3, top: '35%', left: '3%', scale: 0.85, delay: '2.5s', duration: '7.5s', heading: 30 },
    { id: 4, top: '38%', right: '4%', scale: 0.8, delay: '3.8s', duration: '9.5s', heading: -28 },
    { id: 5, top: '65%', left: '5%', scale: 0.88, delay: '1.8s', duration: '8s', heading: 18 },
    { id: 6, top: '70%', right: '6%', scale: 0.92, delay: '0.5s', duration: '10s', heading: -15 },
    { id: 7, top: '84%', left: '22%', scale: 0.75, delay: '4.2s', duration: '7.8s', heading: 12 },
    { id: 8, top: '86%', right: '20%', scale: 0.82, delay: '2.1s', duration: '9.2s', heading: -25 },
    { id: 9, top: '20%', left: '18%', scale: 0.7, delay: '3.2s', duration: '11s', heading: -10 },
    { id: 10, top: '24%', right: '16%', scale: 0.75, delay: '1.6s', duration: '8.2s', heading: 20 },
    { id: 11, top: '52%', left: '14%', scale: 0.68, delay: '2.8s', duration: '10.5s', heading: -14 },
    { id: 12, top: '55%', right: '15%', scale: 0.72, delay: '0.8s', duration: '9s', heading: 16 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none">
      {/* Dark Radial Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#001830]/40 via-[#000814]/90 to-[#000814]" />

      {/* Tactical Background Grid & Dynamic Telemetry Mesh Lines */}
      <svg className="absolute inset-0 w-full h-full opacity-30">
        <defs>
          <pattern id="tactical-grid-bg" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#00ffcc" strokeWidth="0.5" strokeDasharray="2 2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tactical-grid-bg)" />

        {/* Dynamic Mesh Communication Lines connecting hovering drones */}
        <g stroke="#00ffcc" strokeWidth="1" strokeDasharray="4 4" opacity="0.75">
          <line x1="8%" y1="12%" x2="94%" y2="18%" className="animate-pulse" />
          <line x1="94%" y1="18%" x2="94%" y2="73%" className="animate-pulse" />
          <line x1="94%" y1="73%" x2="8%" y2="68%" className="animate-pulse" />
          <line x1="8%" y1="68%" x2="8%" y2="12%" className="animate-pulse" />
          <line x1="8%" y1="12%" x2="4%" y2="38%" />
          <line x1="94%" y1="18%" x2="96%" y2="41%" />
          <line x1="18%" y1="22%" x2="84%" y2="26%" />
          <line x1="14%" y1="54%" x2="85%" y2="57%" />
          <line x1="22%" y1="86%" x2="80%" y2="88%" />
        </g>
      </svg>

      {/* Hovering Tactical Drones */}
      {drones.map((d) => (
        <div
          key={d.id}
          className="absolute transition-transform duration-1000"
          style={{
            top: d.top,
            left: d.left,
            right: d.right,
            transform: `scale(${d.scale}) rotate(${d.heading}deg)`,
            animation: `droneFloat ${d.duration} infinite ease-in-out ${d.delay}`,
          }}
        >
          {/* Scanning Cone Projection Light Beam */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-36 h-52 bg-gradient-to-b from-[#00ffcc]/35 via-[#00ffcc]/5 to-transparent clip-triangle pointer-events-none transform -rotate-12 blur-[1px]" />

          {/* Quadcopter Graphic */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            {/* Rotor Spinning Ring Glows */}
            <div className="absolute top-0 left-0 w-6 h-6 rounded-full border border-[#00ffcc] bg-[#00ffcc]/25 animate-ping" />
            <div className="absolute top-0 right-0 w-6 h-6 rounded-full border border-[#00ffcc] bg-[#00ffcc]/25 animate-ping" style={{ animationDelay: '0.2s' }} />
            <div className="absolute bottom-0 left-0 w-6 h-6 rounded-full border border-[#00ffcc] bg-[#00ffcc]/25 animate-ping" style={{ animationDelay: '0.4s' }} />
            <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full border border-[#00ffcc] bg-[#00ffcc]/25 animate-ping" style={{ animationDelay: '0.6s' }} />

            {/* Rotor Arms (X-Frame) */}
            <div className="absolute w-16 h-1 bg-gradient-to-r from-[#00ffcc] via-[#0055ff] to-[#00ffcc] rotate-45 rounded-full shadow-[0_0_12px_#00ffcc]" />
            <div className="absolute w-16 h-1 bg-gradient-to-r from-[#00ffcc] via-[#0055ff] to-[#00ffcc] -rotate-45 rounded-full shadow-[0_0_12px_#00ffcc]" />

            {/* Central Fuselage Body */}
            <div className="relative z-10 w-7 h-7 bg-[#001226] border-2 border-[#00ffcc] rounded-lg shadow-[0_0_15px_#00ffcc] flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00ffcc] animate-pulse shadow-[0_0_8px_#00ffcc]" />
            </div>

            {/* Navigation Status LEDs */}
            <div className="absolute -top-1 left-1 w-2 h-2 rounded-full bg-[#00ffcc] shadow-[0_0_8px_#00ffcc]" />
            <div className="absolute -top-1 right-1 w-2 h-2 rounded-full bg-[#00ffcc] shadow-[0_0_8px_#00ffcc]" />
            <div className="absolute -bottom-1 left-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ff0055]" />
            <div className="absolute -bottom-1 right-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ff0055]" />
          </div>
        </div>
      ))}

      {/* Keyframe Styles for Hovering Drone Floating Motion */}
      <style>{`
        @keyframes droneFloat {
          0% { transform: translateY(0px) translateX(0px) rotate(0deg); }
          25% { transform: translateY(-22px) translateX(16px) rotate(5deg); }
          50% { transform: translateY(-12px) translateX(-14px) rotate(-4deg); }
          75% { transform: translateY(-28px) translateX(12px) rotate(4deg); }
          100% { transform: translateY(0px) translateX(0px) rotate(0deg); }
        }
        .clip-triangle {
          clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }
      `}</style>
    </div>
  );
}
