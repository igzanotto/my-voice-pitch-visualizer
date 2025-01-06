import React, { useEffect, useState, useRef } from "react";
import { YIN } from "pitchfinder"; // pitchfinder exporta varios métodos (YIN, AMDF, etc.)

function App() {
  const [currentNote, setCurrentNote] = useState(null);
  const [cents, setCents] = useState(0); // Desviación en centésimas de semitono
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const pitchFinderRef = useRef(null);

  // Tabla de notas (C=Do, C#=Do#, etc.)
  const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  /**
   * Convierte la frecuencia a la nota musical más cercana
   * Retorna un objeto con:
   *  - note: nombre de la nota (p.e. "C#")
   *  - octave: número de octava (p.e. 4)
   *  - midi: valor MIDI de la nota (p.e. 61)
   */
  const getNoteDataFromFrequency = (frequency) => {
    const A4 = 440; // La4 = 440 Hz
    const semitonesFromA4 = 12 * (Math.log2(frequency / A4));
    const noteIndex = Math.round(semitonesFromA4) + 69; // 69 es el valor MIDI de A4
    const noteName = noteStrings[noteIndex % 12];
    const octave = Math.floor(noteIndex / 12) - 1;
    return {
      note: noteName,
      octave,
      midi: noteIndex,
    };
  };

  /**
   * Dado un valor MIDI, obtener la frecuencia ideal de esa nota
   */
  const getFrequencyFromMidi = (midi) => {
    // MIDI 69 = A4 = 440 Hz
    return 440 * Math.pow(2, (midi - 69) / 12);
  };

  /**
   * Calcula la diferencia en centésimas de semitono entre la frecuencia real
   * y la frecuencia "ideal" de la nota más cercana.
   */
  const getCentsDifference = (frequency, exactFreq) => {
    // 1200 cents = 1 octava (12 semitonos); de ahí la fórmula
    return 1200 * Math.log2(frequency / exactFreq);
  };

  useEffect(() => {
    // Función principal para configurar el audio
    const setupAudio = async () => {
      try {
        // 1. Pedimos acceso al micrófono
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        // 2. Creamos el AudioContext
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const audioContext = audioContextRef.current;

        // 3. Creamos un source a partir del stream (MediaStreamSource)
        const source = audioContext.createMediaStreamSource(stream);

        // 4. Creamos un GainNode para "normalizar" la señal de entrada
        //    (Aquí subimos un poco la ganancia como ejemplo)
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.5; // Ajusta este valor según tu nivel de señal

        // 5. Creamos el ScriptProcessorNode
        const bufferSize = 1024;
        const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        processorRef.current = processor;

        // 6. Inicializamos el detector de pitch
        pitchFinderRef.current = YIN({ sampleRate: audioContext.sampleRate });

        // 7. En cada evento de "audioprocess", analizamos el buffer
        processor.onaudioprocess = (event) => {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          const frequency = pitchFinderRef.current(inputBuffer);

          if (frequency) {
            // Obtenemos la nota más cercana
            const { note, octave, midi } = getNoteDataFromFrequency(frequency);
            setCurrentNote(`${note}${octave}`);

            // Calculamos la frecuencia ideal de esa nota
            const exactFreq = getFrequencyFromMidi(midi);

            // Calculamos cuántos cents está desviada la frecuencia real
            const diffInCents = getCentsDifference(frequency, exactFreq);
            setCents(diffInCents);
          }
        };

        // 8. Conectamos todo: source -> gainNode -> processor -> destino
        source.connect(gainNode);
        gainNode.connect(processor);
        processor.connect(audioContext.destination); // aunque no reproducimos el audio audible
      } catch (error) {
        console.error("Error al acceder al micrófono:", error);
      }
    };

    setupAudio();

    // Cleanup cuando el componente se desmonte
    return () => {
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Visualizador de afinación
  // Usaremos un rango ±50 cents alrededor del centro
  const tunerWidth = 300;
  const halfRange = 50;
  // 'cents' es cuántas centésimas de semitono estás por encima (+) o por debajo (-)
  const offset = (cents / halfRange) * (tunerWidth / 2);

  return (
    <div style={{ textAlign: "center", marginTop: "2rem" }}>
      <h1>Detector de Notas (con ganancia y Tuner)</h1>
      
      <p>
        {currentNote
          ? `Nota: ${currentNote} (${cents.toFixed(2)} cents)`
          : "Toca algo para empezar..."}
      </p>

      {/* Barra de “afinador” */}
      <div
        style={{
          position: "relative",
          width: tunerWidth + "px",
          height: "10px",
          margin: "20px auto",
          background: "#eee",
        }}
      >
        {/* Marca central (cent = 0) */}
        <div
          style={{
            position: "absolute",
            left: tunerWidth / 2,
            top: 0,
            width: "2px",
            height: "100%",
            background: "#000",
          }}
        />
        {/* Indicador de desviación */}
        <div
          style={{
            position: "absolute",
            left: (tunerWidth / 2) + offset,
            top: "-5px",
            width: "2px",
            height: "20px",
            background: "red",
            transition: "left 0.1s linear",
          }}
        />
      </div>
    </div>
  );
}

export default App;
