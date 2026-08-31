import os
import time
import argparse
import subprocess
import psutil
from pathlib import Path
from typing import Dict, Any

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Warning: faster-whisper not installed. Please run `pip install faster-whisper`")

def measure_resources(pid: int) -> dict:
    try:
        process = psutil.Process(pid)
        mem_info = process.memory_info()
        return {
            "ram_mb": mem_info.rss / 1024 / 1024
        }
    except psutil.NoSuchProcess:
        return {"ram_mb": 0}

def run_demucs(input_audio: Path, output_dir: Path) -> Path:
    print(f"Running Demucs on {input_audio}...")
    # Demucs outputs to <output_dir>/htdemucs/<filename>/vocals.wav by default
    cmd = [
        "demucs", 
        "-n", "htdemucs",
        "--two-stems", "vocals",
        "-o", str(output_dir),
        str(input_audio)
    ]
    start_time = time.time()
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    end_time = time.time()
    
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed: {result.stderr.decode('utf-8', errors='ignore')}")
        
    print(f"Demucs isolation took {end_time - start_time:.2f} seconds.")
    
    # Locate vocals file
    stem_name = input_audio.stem
    vocals_path = output_dir / "htdemucs" / stem_name / "vocals.wav"
    if not vocals_path.exists():
        raise FileNotFoundError(f"Demucs output not found at {vocals_path}")
        
    return vocals_path

def run_whisper(audio_path: Path, model_size: str = "large-v3-turbo") -> str:
    print(f"Running Faster-Whisper ({model_size}) on {audio_path}...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    
    start_time = time.time()
    segments, info = model.transcribe(
        str(audio_path),
        language="ru",
        beam_size=5,
        temperature=0.0,
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        vad_filter=True,
        vad_parameters=dict(
            threshold=0.25,
            min_silence_duration_ms=1200,
            speech_pad_ms=400
        )
    )
    
    text = []
    for segment in segments:
        text.append(segment.text.strip())
        
    end_time = time.time()
    print(f"Whisper transcription took {end_time - start_time:.2f} seconds.")
    
    return "\n".join(text)

def main():
    parser = argparse.ArgumentParser(description="Benchmark STT with and without Demucs")
    parser.add_argument("input", type=str, help="Path to input audio file")
    parser.add_argument("--mode", choices=["baseline", "demucs"], default="baseline", help="Pipeline mode")
    parser.add_argument("--output", type=str, default="transcript_output.txt", help="Output file for transcript")
    
    args = parser.parse_args()
    input_path = Path(args.input)
    
    if not input_path.exists():
        print(f"Error: Input file {input_path} does not exist.")
        return

    pid = os.getpid()
    
    try:
        audio_to_transcribe = input_path
        
        if args.mode == "demucs":
            output_dir = input_path.parent / "demucs_out"
            audio_to_transcribe = run_demucs(input_path, output_dir)
            
        transcript = run_whisper(audio_to_transcribe)
        
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(transcript)
            
        print(f"\n[Success] Transcript saved to {args.output}")
        
        resources = measure_resources(pid)
        print(f"Final Process RAM usage: {resources['ram_mb']:.2f} MB")
        
    except Exception as e:
        print(f"Pipeline failed: {e}")

if __name__ == "__main__":
    main()
