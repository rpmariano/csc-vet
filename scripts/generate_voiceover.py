import asyncio
import os
import subprocess
import edge_tts

VOICE = "pt-PT-DuarteNeural"
RATE = "+18%"
PITCH = "+4Hz"

# Script lines with their target timestamps (seconds)
CUES = [
    # (filename, text, start_time)
    ("cue_00_intro.mp3", "GDS Cascais! Próximo jogo: Amora versus Cascais!", 0.8),
    ("cue_01_convocados.mp3", "Convocatória oficial!", 4.8),
    # 17 players on beat (starting at 7.0s, every 1.6s)
    ("player_01_rocha.mp3", "Rocha!", 7.0),
    ("player_02_pp.mp3", "P P!", 8.6),
    ("player_03_duarte.mp3", "Duarte!", 10.2),
    ("player_04_mariano.mp3", "Mariano!", 11.8),
    ("player_05_matuto.mp3", "Matuto!", 13.4),
    ("player_06_talisson.mp3", "Talisson!", 15.0),
    ("player_07_chaveiro.mp3", "Chaveiro!", 16.6),
    ("player_08_jcosta.mp3", "Jota Costa!", 18.2),
    ("player_09_natalino.mp3", "Natalino!", 19.8), # The drop hits at 20.0s!
    ("player_10_marinho.mp3", "Marinho!", 21.4),
    ("player_11_argolo.mp3", "Argolo!", 23.0),
    ("player_12_albano.mp3", "Albano!", 24.6),
    ("player_13_rios.mp3", "Rios!", 26.2),
    ("player_14_chris.mp3", "Chris!", 27.8),
    ("player_15_marcelo.mp3", "Marcelo!", 29.4),
    ("player_16_gui.mp3", "Gui!", 31.0),
    ("player_17_borges.mp3", "Borges!", 32.6),
    # Full squad
    ("cue_18_plantel.mp3", "Dezassete guerreiros convocados!", 34.6),
    # Outro
    ("cue_19_outro.mp3", "Todos à Medideira! Rumo à vitória! Vamos Cascais!", 40.5),
]

os.makedirs("scripts/voice_cues", exist_ok=True)

async def generate_cues():
    print("Generating voice cues with edge-tts...")
    for filename, text, start_time in CUES:
        path = os.path.join("scripts/voice_cues", filename)
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
        await communicate.save(path)
        print(f"Generated {filename}: '{text}' at {start_time}s")

if __name__ == "__main__":
    asyncio.run(generate_cues())
