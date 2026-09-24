/**
 * Singleton AudioQueueManager to prevent overlapping audio
 * Ensures sequential playback of audio and handles priority alerts.
 */

export class AudioQueueManager {
  private static instance: AudioQueueManager;
  private queue: Array<() => Promise<void>> = [];
  private isPlaying = false;
  private activeGainNode: GainNode | null = null;
  private audioContext: AudioContext | null = null;

  private constructor() {}

  public static getInstance(): AudioQueueManager {
    if (!AudioQueueManager.instance) {
      AudioQueueManager.instance = new AudioQueueManager();
    }
    return AudioQueueManager.instance;
  }

  public setAudioContext(ctx: AudioContext) {
    this.audioContext = ctx;
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Enqueue a standard audio task (e.g. LLM response chunk)
   */
  public enqueue(task: () => Promise<void>) {
    this.queue.push(task);
    this.processQueue();
  }

  /**
   * Play a priority system alert immediately with ducking effect
   */
  public playSystemAlert(frequencies: number[] = [600, 800]) {
    if (!this.audioContext) return;
    
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    
    // Apply ducking to active GainNode if any
    if (this.activeGainNode) {
      this.activeGainNode.gain.cancelScheduledValues(now);
      this.activeGainNode.gain.setValueAtTime(this.activeGainNode.gain.value, now);
      this.activeGainNode.gain.linearRampToValueAtTime(0.3, now + 0.1);
    }
    
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.2);
      
      gain.gain.setValueAtTime(0, now + i * 0.2);
      gain.gain.linearRampToValueAtTime(0.5, now + i * 0.2 + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.2 + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.3);
    });
    
    // Restore ducking
    if (this.activeGainNode) {
      const restoreTime = now + (frequencies.length * 0.2) + 0.3;
      this.activeGainNode.gain.setValueAtTime(0.3, restoreTime);
      this.activeGainNode.gain.linearRampToValueAtTime(1.0, restoreTime + 0.2);
    }
  }

  public setActiveGainNode(node: GainNode | null) {
    this.activeGainNode = node;
  }

  private async processQueue() {
    if (this.isPlaying || this.queue.length === 0) return;
    
    this.isPlaying = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (err) {
          console.error("Audio task failed:", err);
        }
      }
    }
    this.isPlaying = false;
  }
}
