#!/usr/bin/env python3
"""Generate baked narration clips with Kokoro-82M (British 'Isabella' voice).

Run this ON YOUR MAC (needs internet the first time to fetch the model):

    brew install espeak-ng ffmpeg
    python3 -m venv .venv && source .venv/bin/activate
    pip install kokoro soundfile
    node tools/make-voice-lines.js
    python3 tools/generate-voice.py

Output: assets/voice/<key>.mp3 (24 kHz mono, ~32 kbps). Then rebuild:

    node build-game.js

build-game.js embeds every clip it finds in assets/voice/ into game.html as
base64; the game plays clips when present and falls back to device TTS for
anything unbaked (story frames, lines with her name). Delete assets/voice/
and rebuild to go back to pure TTS.
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
LINES = os.path.join(HERE, 'voice-lines.json')
OUT = os.path.join(HERE, '..', 'assets', 'voice')
VOICE = 'bf_isabella'       # British female; try bf_emma / bf_alice / bf_lily too
SPEED = 0.92                # slightly slow for a four-year-old listener

def main():
    if not os.path.exists(LINES):
        sys.exit('tools/voice-lines.json missing - run: node tools/make-voice-lines.js')
    from kokoro import KPipeline
    import soundfile as sf
    os.makedirs(OUT, exist_ok=True)
    pipe = KPipeline(lang_code='b')     # 'b' = British English
    lines = json.load(open(LINES))
    done = 0
    for key, text in lines.items():
        mp3 = os.path.join(OUT, key + '.mp3')
        if os.path.exists(mp3):
            continue
        chunks = [audio for _, _, audio in pipe(text, voice=VOICE, speed=SPEED)]
        if not chunks:
            print('!! no audio for', key); continue
        import numpy as np
        wavdata = np.concatenate(chunks)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
            sf.write(t.name, wavdata, 24000)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', t.name,
                            '-ac', '1', '-b:a', '32k', mp3], check=True)
            os.unlink(t.name)
        done += 1
        if done % 20 == 0:
            print(f'{done} clips...')
    print(f'done: {done} new clips in {OUT} ({len(lines)} total lines)')

if __name__ == '__main__':
    main()
