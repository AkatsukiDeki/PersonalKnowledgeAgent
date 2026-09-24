import React, { useEffect, createContext, useContext } from 'react';
import { toast } from 'react-toastify';

interface AlertProviderProps {
    userId: string;
    children: React.ReactNode;
}

const AlertContext = createContext({});

// Simple Web Audio API beep generator
const playAlertSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        
        // Two-tone soft ping
        const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
            
            gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(ctx.currentTime + startTime);
            osc.stop(ctx.currentTime + startTime + duration);
        };

        playTone(600, 0, 0.2);
        playTone(800, 0.15, 0.3);
    } catch (e) {
        console.error("Web Audio API not supported", e);
    }
};

export const AlertProvider: React.FC<AlertProviderProps> = ({ userId, children }) => {
    
    useEffect(() => {
        if (!userId) return;

        // WebSocket connection to backend alerts
        const wsUrl = `ws://localhost:8000/api/v1/planner/calendar/ws/alerts/${userId}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("Alert WebSocket Connected");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'reminder') {
                    // Play sound
                    playAlertSound();
                    
                    // Show Toast
                    const isCritical = data.priority === 'critical' || data.priority === 'high';
                    toast(data.message, {
                        type: isCritical ? 'error' : 'info',
                        position: 'top-right',
                        autoClose: isCritical ? false : 5000,
                        hideProgressBar: false,
                        closeOnClick: true,
                        pauseOnHover: true,
                        draggable: true,
                    });
                }
            } catch (e) {
                console.error("Failed to parse WS message", e);
            }
        };

        ws.onerror = (error) => {
            console.error("Alert WebSocket error", error);
        };

        ws.onclose = () => {
            console.log("Alert WebSocket Disconnected");
        };

        return () => {
            ws.close();
        };
    }, [userId]);

    return (
        <AlertContext.Provider value={{}}>
            {children}
        </AlertContext.Provider>
    );
};

export const useAlerts = () => useContext(AlertContext);
