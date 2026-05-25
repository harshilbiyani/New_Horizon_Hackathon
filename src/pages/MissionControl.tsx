import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

export default function MissionControl() {
    const [command, setCommand] = useState('');
    const [logs, setLogs] = useState<string[]>([]);
    const [detections, setDetections] = useState<any[]>([]);
    const [intent, setIntent] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [mobileConnected, setMobileConnected] = useState(false);
    
    useEffect(() => {
        const socket = io(); // Connects to the host where it's served
        
        socket.on('mission_command_parsed', (data) => {
            setIntent(data);
        });

        socket.on('mission_detection', (det) => {
            setDetections(prev => [det, ...prev]);
        });

        socket.on('mission_field_report', (data) => {
            setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${data.report}`, ...prev]);
        });

        socket.on('mission_mobile_status', (status) => {
            setMobileConnected(status.connected);
        });

        return () => {
            socket.off('mission_command_parsed');
            socket.off('mission_detection');
            socket.off('mission_field_report');
            socket.off('mission_mobile_status');
        };
    }, []);

    const sendCommand = async () => {
        if (!command) return;
        setLoading(true);
        try {
            const res = await fetch('/api/mission/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: command })
            });
            await res.json();
            setCommand('');
        } catch (err) {
            console.error("Failed to send command:", err);
        } finally {
            setLoading(false);
        }
    };

    const getUrgencyColor = (urgency: string) => {
        switch(urgency) {
            case 'high': return '#ef4444';
            case 'medium': return '#f59e0b';
            case 'low': return '#10b981';
            default: return '#3b82f6';
        }
    };

    // To construct the network IP for the QR code dynamically
    // When using ngrok, the origin will be the ngrok HTTPS URL
    const mobileUrl = `${window.location.origin}/drone-view.html`;

    return (
        <div className="p-6 text-gray-200 bg-gray-950 min-h-screen font-mono">
            <h2 className="text-2xl text-green-400 mb-6 border-b border-green-900 pb-2">AI Mission Control Terminal</h2>
            
            <div className="grid grid-cols-3 gap-6">
                {/* Left Column: Command & Mobile */}
                <div className="bg-gray-900 p-4 border border-gray-800 rounded-lg flex flex-col gap-6">
                    <div>
                        <h3 className="text-lg text-green-500 mb-4">Command Layer</h3>
                        <input
                            type="text"
                            value={command}
                            onKeyDown={(e) => e.key === 'Enter' && sendCommand()}
                            onChange={(e) => setCommand(e.target.value)}
                            placeholder="e.g. Search NE zone for kids immediately"
                            className="w-full p-3 bg-gray-800 text-green-400 border border-gray-700 rounded mb-3"
                            disabled={loading}
                        />
                        <button 
                            onClick={sendCommand} 
                            disabled={loading}
                            className="w-full p-2 bg-green-900 text-white rounded hover:bg-green-800 disabled:opacity-50">
                            {loading ? 'Processing Intent...' : 'Execute Command'}
                        </button>

                        {/* Intent Chip */}
                        {intent && (
                            <div className="mt-4 p-3 rounded" style={{ backgroundColor: `${getUrgencyColor(intent.urgency)}20`, border: `1px solid ${getUrgencyColor(intent.urgency)}`}}>
                                <div className="text-xs uppercase opacity-75">Parsed Intent</div>
                                <div className="font-bold flex gap-2 items-center mt-1">
                                    <span className="bg-black/30 px-2 py-0.5 rounded text-sm">Target: {intent.target_type}</span>
                                    <span className="bg-black/30 px-2 py-0.5 rounded text-sm">Zone: {intent.zone}</span>
                                    <span className="bg-black/30 px-2 py-0.5 rounded text-sm" style={{ color: getUrgencyColor(intent.urgency) }}>{intent.urgency}</span>
                                </div>
                                <div className="mt-2 text-sm italic">"{intent.summary}"</div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t border-gray-800">
                        <h3 className="text-lg text-green-500 mb-4">Mobile Drone View</h3>
                        <div className="bg-white p-2 w-fit mx-auto rounded">
                            <QRCodeSVG value={mobileUrl} size={150} />
                        </div>
                        <div className="text-center mt-3 text-sm">
                            Status: {mobileConnected ? 
                                <span className="text-green-400 font-bold">Connected</span> : 
                                <span className="text-yellow-500">Waiting for connection...</span>
                            }
                        </div>
                        <div className="text-center mt-2 text-xs text-gray-500 break-all">{mobileUrl}</div>
                    </div>
                </div>

                {/* Center Column: Detections */}
                <div className="bg-gray-900 p-4 border border-gray-800 rounded-lg flex flex-col">
                    <h3 className="text-lg text-blue-400 mb-4">Live Detections (YOLO)</h3>
                    <div className="flex-1 overflow-y-auto max-h-[600px] flex flex-col gap-3">
                        {detections.map((det, i) => (
                            <div key={i} className={`p-3 bg-gray-800 rounded border ${det.confidence > 0.85 ? 'border-red-500 animate-pulse' : 'border-gray-700'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-blue-300 font-bold">Drone {det.drone_id}</span>
                                    <span className="text-xs text-gray-400">{new Date(det.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="bg-gray-700 px-2 py-1 title text-sm rounded">Class: {det.class_name}</span>
                                    <span className={`font-bold ${det.confidence > 0.85 ? 'text-red-400' : 'text-green-400'}`}>
                                        {(det.confidence * 100).toFixed(1)}% Conf
                                    </span>
                                </div>
                                <div className="mt-2 text-xs text-gray-400">Zone: {det.zone}</div>
                            </div>
                        ))}
                        {detections.length === 0 && <div className="text-center text-gray-600 mt-10">No targets detected yet.</div>}
                    </div>
                </div>

                {/* Right Column: Tactical Reports */}
                <div className="bg-gray-900 p-4 border border-gray-800 rounded-lg flex flex-col">
                    <h3 className="text-lg text-amber-500 mb-4">Tactical Intelligence (LLM)</h3>
                    <div className="flex-1 overflow-y-auto max-h-[600px] flex flex-col gap-3">
                        {logs.map((log, i) => (
                            <div key={i} className="p-3 bg-gray-800 rounded border border-amber-900/50 text-sm text-gray-300">
                                {log}
                            </div>
                        ))}
                        {logs.length === 0 && <div className="text-center text-gray-600 mt-10">Awaiting field intelligence...</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
