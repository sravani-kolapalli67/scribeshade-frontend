import { useState, useRef, useCallback, useEffect } from 'react';

interface UseDeepgramProps {
  apiKey: string;
  model?: string;
  onTranscript?: (text: string, isFinal: boolean) => void;
  inputStream?: MediaStream | null;
}

export const useDeepgram = ({ apiKey, model = 'nova-3', onTranscript, inputStream }: UseDeepgramProps) => {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef(false);
  const ownsStreamRef = useRef(false);

  const startTranscription = useCallback(async () => {
    if (isTranscribing || isStartingRef.current) return;

    try {
      isStartingRef.current = true;
      setIsConnecting(true);
      setError(null);

      let stream: MediaStream;
      if (inputStream) {
        stream = inputStream;
        ownsStreamRef.current = false;
        // Verify audio tracks exist in the provided stream
        if (stream.getAudioTracks().length === 0) {
          // We don't throw here to avoid crashing, but we won't get audio if shared without audio
          console.warn('Deepgram: Provided inputStream has no audio tracks.');
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true,
            sampleRate: 16000 
          } 
        });
        ownsStreamRef.current = true;
      }
      
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: 'audio/webm;codecs=opus' 
      });
      mediaRecorderRef.current = mediaRecorder;

      const socket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=${model}&punctuate=true&interim_results=true&language=en`, 
        ['token', apiKey]
      );
      socketRef.current = socket;

      socket.onopen = () => {
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };
        mediaRecorder.start(250);  // 250ms chunks for low latency
        setIsTranscribing(true);
        setIsConnecting(false);
        isStartingRef.current = false;
        setError(null);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'Results' && data.channel?.alternatives?.[0]?.transcript) {
          const newText = data.channel.alternatives[0].transcript;
          const isFinal = data.is_final;

          if (isFinal) {
            setTranscript((prev) => (prev + ' ' + newText).trim());
            setInterimTranscript('');
          } else {
            setInterimTranscript(newText);
          }

          if (onTranscript) {
            onTranscript(newText, isFinal);
          }
        }
      };

      socket.onerror = (err) => {
        console.error('Deepgram Socket Error:', err);
        setError('Socket error');
        setIsConnecting(false);
        isStartingRef.current = false;
      };

      socket.onclose = () => {
        setIsTranscribing(false);
        setIsConnecting(false);
        isStartingRef.current = false;
        if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
      };
    } catch (err) {
      console.error('Deepgram Permission Error:', err);
      setError((err as Error).message);
      setIsConnecting(false);
      isStartingRef.current = false;
    }
  }, [apiKey, model, isTranscribing, onTranscript, inputStream]);

  const stopTranscription = useCallback(() => {
    isStartingRef.current = false;
    if (socketRef.current) {
        if (socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        }
        socketRef.current.close();
        socketRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    
    // Only stop tracks if we own the stream (i.e., we called getUserMedia)
    if (streamRef.current && ownsStreamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    streamRef.current = null;
    
    setIsTranscribing(false);
    setIsConnecting(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

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
    clearTranscript 
  };
};
