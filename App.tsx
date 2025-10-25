import React, { useState, useRef, useCallback, useEffect } from 'react';
// Fix: Removed non-exported 'LiveSession' type.
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { AssistantStatus, TranscriptionEntry } from './types';
import { createBlob, decode, decodeAudioData } from './utils/audioUtils';
import VirtualAssistantAvatar from './components/VirtualAssistantAvatar';
import TranscriptionDisplay from './components/TranscriptionDisplay';

const App: React.FC = () => {
  const [status, setStatus] = useState<AssistantStatus>(AssistantStatus.IDLE);
  const [transcriptionHistory, setTranscriptionHistory] = useState<TranscriptionEntry[]>(() => {
    try {
      const savedHistory = localStorage.getItem('transcriptionHistory');
      return savedHistory ? JSON.parse(savedHistory) : [];
    } catch (error) {
      console.error("Failed to parse transcription history from localStorage", error);
      return [];
    }
  });
  const [currentUserTranscription, setCurrentUserTranscription] = useState('');
  const [currentAssistantTranscription, setCurrentAssistantTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fix: Replaced 'LiveSession' with 'any' as the session type is not exported from the SDK.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const nextAudioStartTimeRef = useRef(0);
  const audioPlaybackSourcesRef = useRef(new Set<AudioBufferSourceNode>());

  const currentUserTranscriptionRef = useRef('');
  const currentAssistantTranscriptionRef = useRef('');

  useEffect(() => {
    // Save history to localStorage whenever it changes
    try {
      localStorage.setItem('transcriptionHistory', JSON.stringify(transcriptionHistory));
    } catch (error) {
      console.error("Failed to save transcription history to localStorage", error);
    }
  }, [transcriptionHistory]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
      }
      stopMicrophone();
    };
  }, []);

  const stopMicrophone = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
  }, []);

  const handleSessionEnd = useCallback(() => {
    setStatus(AssistantStatus.IDLE);
    stopMicrophone();
    sessionPromiseRef.current = null;
    
    // Stop any ongoing playback
    audioPlaybackSourcesRef.current.forEach(source => source.stop());
    audioPlaybackSourcesRef.current.clear();
    nextAudioStartTimeRef.current = 0;

    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }

  }, [stopMicrophone]);

  const handleToggleSession = async () => {
    if (status !== AssistantStatus.IDLE) {
      if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => session.close());
      }
      handleSessionEnd();
      return;
    }

    setError(null);
    currentUserTranscriptionRef.current = '';
    currentAssistantTranscriptionRef.current = '';
    setCurrentUserTranscription('');
    setCurrentAssistantTranscription('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      setStatus(AssistantStatus.THINKING);

      // Fix: Cast window to `any` to allow access to `webkitAudioContext` for broader browser support without TypeScript errors.
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      // Fix: Cast window to `any` to allow access to `webkitAudioContext` for broader browser support without TypeScript errors.
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputAudioContextRef.current!.createMediaStreamSource(streamRef.current!);
            mediaStreamSourceRef.current = source;
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
            setStatus(AssistantStatus.LISTENING);
          },
          onmessage: async (message: LiveServerMessage) => {
             if (message.serverContent?.inputTranscription) {
              currentUserTranscriptionRef.current += message.serverContent.inputTranscription.text;
              setCurrentUserTranscription(currentUserTranscriptionRef.current);
             }
             
             if (message.serverContent?.outputTranscription) {
              // Fix: Removed comparison with stale `status` state. It's safe to call `setStatus`
              // unconditionally here as React handles no-op state updates efficiently.
              setStatus(AssistantStatus.SPEAKING);
              currentAssistantTranscriptionRef.current += message.serverContent.outputTranscription.text;
              setCurrentAssistantTranscription(currentAssistantTranscriptionRef.current);
             }

             if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                const audioData = message.serverContent.modelTurn.parts[0].inlineData.data;
                const outputContext = outputAudioContextRef.current;
                if (outputContext) {
                    const audioBuffer = await decodeAudioData(decode(audioData), outputContext, 24000, 1);
                    const source = outputContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputContext.destination);
                    
                    source.onended = () => {
                        audioPlaybackSourcesRef.current.delete(source);
                        if (audioPlaybackSourcesRef.current.size === 0) {
                            setStatus(AssistantStatus.LISTENING);
                        }
                    };
                    
                    const currentTime = outputContext.currentTime;
                    const startTime = Math.max(currentTime, nextAudioStartTimeRef.current);
                    source.start(startTime);
                    nextAudioStartTimeRef.current = startTime + audioBuffer.duration;
                    audioPlaybackSourcesRef.current.add(source);
                }
             }

             if (message.serverContent?.turnComplete) {
                setTranscriptionHistory(prev => [...prev, {
                  user: currentUserTranscriptionRef.current,
                  assistant: currentAssistantTranscriptionRef.current
                }]);
                currentUserTranscriptionRef.current = '';
                currentAssistantTranscriptionRef.current = '';
                setCurrentUserTranscription('');
                setCurrentAssistantTranscription('');
             }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Session error:', e);
            setError('Ocorreu um erro na sessão. Por favor, tente novamente.');
            handleSessionEnd();
          },
          onclose: () => {
             handleSessionEnd();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: "Você é 'PyA', um assistente virtual especialista em programação Python e estudos acadêmicos. Seu objetivo é ajudar os usuários a aprender, resolver problemas de código e entender conceitos complexos de forma clara, amigável e didática. Use analogias e exemplos práticos sempre que possível. Responda em português do Brasil.",
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
        },
      });

    } catch (err) {
      console.error('Failed to start session:', err);
      setError('Não foi possível acessar o microfone. Verifique as permissões e tente novamente.');
      setStatus(AssistantStatus.IDLE);
    }
  };

  const getButtonState = () => {
    switch (status) {
      case AssistantStatus.IDLE:
        return { text: 'Iniciar Conversa', icon: MicIcon, bg: 'bg-cyan-500 hover:bg-cyan-600', animate: false };
      case AssistantStatus.THINKING:
        return { text: 'Conectando...', icon: LoadingIcon, bg: 'bg-purple-500', animate: true };
      case AssistantStatus.LISTENING:
      case AssistantStatus.SPEAKING:
        return { text: 'Encerrar Conversa', icon: StopIcon, bg: 'bg-red-500 hover:bg-red-600', animate: false };
      default:
        return { text: 'Iniciar', icon: MicIcon, bg: 'bg-gray-500', animate: false };
    }
  };
  
  const { text, icon: Icon, bg, animate } = getButtonState();

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 space-y-8">
      <header className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-green-400">
          Assistente Virtual PyA
        </h1>
        <p className="text-gray-400 mt-2">Seu tutor de Python com IA</p>
      </header>

      <VirtualAssistantAvatar status={status} />

      <TranscriptionDisplay
        history={transcriptionHistory}
        currentUserTranscription={currentUserTranscription}
        currentAssistantTranscription={currentAssistantTranscription}
      />
      
      {error && <p className="text-red-400 bg-red-900/50 px-4 py-2 rounded-md">{error}</p>}

      <button
        onClick={handleToggleSession}
        disabled={status === AssistantStatus.THINKING}
        className={`px-8 py-4 rounded-full flex items-center justify-center space-x-3 text-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg focus:outline-none focus:ring-4 focus:ring-opacity-50 ${bg} ${status === AssistantStatus.THINKING ? 'cursor-not-allowed' : ''} ${bg === 'bg-cyan-500 hover:bg-cyan-600' ? 'focus:ring-cyan-400' : ''} ${bg === 'bg-red-500 hover:bg-red-600' ? 'focus:ring-red-400' : ''}`}
      >
        <Icon animate={animate} />
        <span>{text}</span>
      </button>
    </div>
  );
};

// SVG Icon Components
const MicIcon = ({ animate = false }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);
const StopIcon = ({ animate = false }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 16 16">
    <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/>
  </svg>
);
const LoadingIcon = ({ animate = false }) => (
  <svg className={`h-6 w-6 ${animate ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);


export default App;
