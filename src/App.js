import React, { useEffect, useState, useRef } from "react";
import { YIN } from "pitchfinder";

function App() {
  // Estado para mostrar la nota actual como texto.
  const [currentNoteLabel, setCurrentNoteLabel] = useState("");
  
  // Rango de notas para el eje Y (en MIDI).
  // E2 = 40, G#5 ~ 80 (ajusta según tu rango de interés).
  const midiMin = 40;
  const midiMax = 80;

  // Para el suavizado de la nota detectada
  const smoothingWindowSize = 5;
  // Para el historial que se dibuja en el canvas (~3 segundos)
  const maxHistorySize = 130;  

  // Aquí guardaremos las últimas N notas “floats” para el promedio
  const smoothingNotesRef = useRef([]);

  // Aquí guardaremos el historial grande para dibujar
  const drawHistoryRef = useRef([]);

  // Referencias de audio
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const pitchFinderRef = useRef(null);

  // Referencia al canvas para dibujar
  const canvasRef = useRef(null);

  // Lista de notas en semitonos
  const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // === Funciones de utilidad ===

  // Convierte frecuencia a un “float midi” (p.e. 69.3)
  function freqToMidiFloat(freq) {
    const A4 = 440;
    const semitonesFromA4 = 12 * Math.log2(freq / A4);
    return semitonesFromA4 + 69; // 69 = MIDI de A4
  }

  // Dada una nota midi (float), separa en nota base (entera) y cents
  function getNoteNameAndCents(noteFloat) {
    const rounded = Math.round(noteFloat);
    const noteIndex = rounded % 12;
    const octave = Math.floor(rounded / 12) - 1;
    const noteName = noteStrings[noteIndex];

    // Cents: diferencia * 100
    // Por ejemplo, si noteFloat = 69.20 => +0.20 semitonos => 20 cents
    const diff = noteFloat - rounded; 
    const cents = diff * 100; 

    return { noteName, octave, cents };
  }

  // Mapea el valor MIDI (float) al eje Y del canvas
  // midiMin => Y = h, midiMax => Y = 0
  function midiFloatToY(midiVal, canvasHeight) {
    const range = midiMax - midiMin;
    const pct = (midiVal - midiMin) / range;
    return (1 - pct) * canvasHeight;
  }

  // === useEffect para configuración de Audio/Pitch ===
  useEffect(() => {
    async function setupAudio() {
      try {
        // 1. Acceso al micrófono
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        // 2. AudioContext
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;

        // 3. Source
        const source = audioContext.createMediaStreamSource(stream);

        // 4. (Opcional) Gain para subir señal
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.5;

        // 5. ScriptProcessor
        const bufferSize = 1024;
        const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        processorRef.current = processor;

        // 6. PitchFinder (YIN)
        pitchFinderRef.current = YIN({ sampleRate: audioContext.sampleRate });

        // 7. Callback de audio
        processor.onaudioprocess = (event) => {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          const frequency = pitchFinderRef.current(inputBuffer);

          if (frequency) {
            // Convertimos la freq a un float MIDI (p.e. 69.15)
            const noteFloat = freqToMidiFloat(frequency);

            // (1) Suavizado de la nota
            const smoothArr = smoothingNotesRef.current;
            smoothArr.push(noteFloat);
            if (smoothArr.length > smoothingWindowSize) {
              smoothArr.shift();
            }
            // Promedio
            const avgNoteFloat = smoothArr.reduce((a, b) => a + b, 0) / smoothArr.length;

            // (2) Actualizamos la etiqueta textual
            const { noteName, octave, cents } = getNoteNameAndCents(avgNoteFloat);
            setCurrentNoteLabel(`${noteName}${octave} (${cents.toFixed(2)} cents)`);

            // (3) Guardamos la nota suavizada en el historial grande para dibujar
            const drawArr = drawHistoryRef.current;
            drawArr.push(avgNoteFloat);
            if (drawArr.length > maxHistorySize) {
              drawArr.shift();
            }
          }
        };

        // 8. Conectar
        source.connect(gainNode);
        gainNode.connect(processor);
        processor.connect(audioContext.destination);

      } catch (error) {
        console.error("Error al acceder al micrófono:", error);
      }
    }

    setupAudio();

    // Cleanup
    return () => {
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // === useEffect para dibujar el canvas en bucle ===
  useEffect(() => {
    let animationId;

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationId = requestAnimationFrame(draw);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;

      // Limpia
      ctx.clearRect(0, 0, w, h);

      // -------------------
      // (A) Dibujar líneas horizontales para notas enteras
      // -------------------
      ctx.strokeStyle = "#ccc";
      ctx.fillStyle = "#666";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "right";

      for (let midi = midiMin; midi <= midiMax; midi++) {
        const y = midiFloatToY(midi, h);

        // Línea
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        // Etiqueta (por ej, E2 para midi=40)
        const noteIndex = midi % 12;
        const octave = Math.floor(midi / 12) - 1;
        const label = `${noteStrings[noteIndex]}${octave}`;
        ctx.fillText(label, 30, y - 2);
      }

      // -------------------
      // (B) Dibujar la curva con el historial
      // -------------------
      const drawArr = drawHistoryRef.current;
      if (drawArr.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = "red";
        ctx.lineWidth = 2;

        const length = drawArr.length;
        for (let i = 0; i < length; i++) {
          const val = drawArr[i]; // midi float
          const x = (i / (length - 1)) * w;
          const y = midiFloatToY(val, h);

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      animationId = requestAnimationFrame(draw);
    }

    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [midiMin, midiMax, noteStrings, maxHistorySize]);

  return (
    <div style={{ textAlign: "center", marginTop: "2rem" }}>
      <h1>Detector de Notas con Rango ~3s y Eje de Notas</h1>
      <p>{currentNoteLabel ? `Nota: ${currentNoteLabel}` : "Sin detección..."}</p>

      <div style={{ width: "600px", margin: "0 auto", border: "1px solid #ccc" }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          style={{ background: "#fafafa" }}
        />
      </div>
    </div>
  );
}

export default App;
