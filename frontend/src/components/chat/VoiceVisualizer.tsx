import React, { useEffect, useRef } from 'react';
import { AudioQueueManager } from '../../utils/AudioQueue';

interface VoiceVisualizerProps {
  width?: number;
  height?: number;
  color?: string;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ 
  width = 300, 
  height = 60,
  color = '#4ade80' // default green
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const manager = AudioQueueManager.getInstance();
    const ctx = manager.getAudioContext();
    
    if (ctx) {
      // Create AnalyserNode
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      
      // Try to connect the master destination to the analyser for visualization
      // Note: Usually we connect the source to analyser, then to destination.
      // But since we want a global visualizer, we can create a generic analyser 
      // and ensure audio nodes connect to it before destination.
      analyserRef.current = analyser;
    }

    const draw = () => {
      if (!canvasRef.current || !analyserRef.current) {
        animationFrameId.current = requestAnimationFrame(draw);
        return;
      }
      
      const canvas = canvasRef.current;
      const canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) return;

      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      analyser.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      // Check if silent
      const isSilent = dataArray.every(v => v === 0);
      
      if (isSilent && !AudioQueueManager.getInstance()['isPlaying']) {
        // If silent and queue isn't playing, stop animation loop to save GPU
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
        return;
      }

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        
        canvasCtx.fillStyle = color;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        x += barWidth + 1;
      }

      animationFrameId.current = requestAnimationFrame(draw);
    };

    animationFrameId.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [color]);

  // Expose the analyser node to the manager or global scope if needed
  useEffect(() => {
    (window as any).globalVoiceAnalyser = analyserRef.current;
    return () => {
      (window as any).globalVoiceAnalyser = null;
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      style={{ display: 'block', margin: '0 auto' }}
    />
  );
};
