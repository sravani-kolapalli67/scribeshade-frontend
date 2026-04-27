import { useState, useRef, useCallback, useEffect } from "react";

interface UseDeepgramProps {
  apiKey: string;
  model?: string;
  language?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  inputStream?: MediaStream | null;
}

export const useDeepgram = ({
  apiKey,
  model = "nova-3",
  language = "en",
  onTranscript,
  inputStream,
}: UseDeepgramProps) => {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef(false);
  const ownsStreamRef = useRef(false);

  const startTranscription = useCallback(async () => {
    if (isTranscribing || isStartingRef.current || socketRef.current) return;

    try {
      isStartingRef.current = true;
      setIsConnecting(true);
      setError(null);

      let stream: MediaStream;
      if (inputStream) {
        // Create a new stream with only audio tracks to avoid MediaRecorder issues with video
        const audioTracks = inputStream.getAudioTracks();
        if (audioTracks.length === 0) {
          console.error(
            "Deepgram: No audio tracks found in provided inputStream.",
          );
          setError("No audio detected in share. Did you check 'Share audio'?");
          setIsConnecting(false);
          isStartingRef.current = false;
          return;
        }
        stream = new MediaStream(audioTracks);
        ownsStreamRef.current = false;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          },
        });
        ownsStreamRef.current = true;
      }

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000, // High quality audio encoding for better accuracy
      });
      mediaRecorderRef.current = mediaRecorder;

      const url = `wss://api.deepgram.com/v1/listen?model=${model}&punctuate=true&interim_results=true&language=${language}&smart_format=true&endpointing=1000&utterance_end_ms=1000&vad_events=true&diarize=false&tag=craftvita`;

      const socket = new WebSocket(url, ["token", apiKey]);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!mediaRecorderRef.current || socket !== socketRef.current) {
          socket.close();
          return;
        }
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };
        // Send audio chunks every 100ms for near real-time streaming
        mediaRecorder.start(100);
        setIsTranscribing(true);
        setIsConnecting(false);
        isStartingRef.current = false;
        setError(null);
      };

      socket.onmessage = (event) => {
        if (socket !== socketRef.current) return;
        const data = JSON.parse(event.data);

        if (data.type === "Results" && data.channel?.alternatives?.[0]) {
          const alternative = data.channel.alternatives[0];
          const newText = alternative.transcript;
          const isFinal = data.is_final;

          if (isFinal) {
            if (newText.trim()) {
              setTranscript((prev) => (prev + " " + newText).trim());
            }
            setInterimTranscript("");
          } else if (newText) {
            setInterimTranscript(newText);
          }

          if (onTranscript && (newText.trim() || !isFinal)) {
            onTranscript(newText, isFinal);
          }
        }
      };

      socket.onerror = (err) => {
        if (socket !== socketRef.current) return;
        console.error("Deepgram Socket Error:", err);
        setError("Connection error occurred");
        setIsConnecting(false);
        isStartingRef.current = false;
        setIsTranscribing(false);
      };

      socket.onclose = () => {
        if (socket !== socketRef.current) return;
        setIsTranscribing(false);
        setIsConnecting(false);
        isStartingRef.current = false;
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
        }
      };
    } catch (err) {
      if (isStartingRef.current) {
        console.error("Deepgram Error:", err);
        setError((err as Error).message);
        setIsConnecting(false);
        isStartingRef.current = false;
        setIsTranscribing(false);
      }
    }
  }, [apiKey, model, language, isTranscribing, onTranscript, inputStream]);

  const stopTranscription = useCallback(() => {
    isStartingRef.current = false;
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
      socketRef.current.close();
      socketRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current && ownsStreamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;

    setIsTranscribing(false);
    setIsConnecting(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  // Handle inputStream changes:
  // When the screen-share stream is replaced (user picks a new tab / audio toggled),
  // tear down the existing session so the caller's auto-start effect can restart
  // cleanly with the new inputStream.
  const prevInputStreamRef = useRef<MediaStream | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevInputStreamRef.current;
    prevInputStreamRef.current = inputStream;

    // Only react to actual stream changes (not the initial mount)
    if (prev === undefined) return;

    if (prev !== inputStream) {
      // Stream swapped — stop so the auto-start effect can restart with new audio
      stopTranscription();
    }
  }, [inputStream, stopTranscription]);

  useEffect(() => {
    return () => {
      stopTranscription();
    };
  }, [stopTranscription]);

  return {
    transcript,
    interimTranscript,
    isTranscribing,
    isConnecting,
    error,
    startTranscription,
    stopTranscription,
    clearTranscript,
  };
};
