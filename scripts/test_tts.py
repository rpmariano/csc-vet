import asyncio
import edge_tts

async def test_tts():
    voice = "pt-PT-DuarteNeural"
    text = "Rocha! Matuto! Talisson! Mariano! Duarte! PP! Chaveiro! J. Costa! Natalino! Marinho! Argolo! Albano! Rios! Chris! Marcelo! Gui! Borges!"
    communicate = edge_tts.Communicate(text, voice, rate="+25%", pitch="+5Hz")
    await communicate.save("scripts/test_voice.mp3")
    print("Voice generated successfully!")

if __name__ == "__main__":
    asyncio.run(test_tts())
