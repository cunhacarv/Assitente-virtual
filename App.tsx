import React, { useState, useRef, useCallback, useEffect } from 'react';
// Fix: Removed non-exported 'LiveSession' type.
import { GoogleGenAI, LiveServerMessage, Modality, Chat, Part } from '@google/genai';
import { AssistantStatus, TranscriptionEntry } from './types';
import { createBlob, decode, decodeAudioData } from './utils/audioUtils';
import VirtualAssistantAvatar from './components/VirtualAssistantAvatar';
import TranscriptionDisplay from './components/TranscriptionDisplay';
import TextInput from './components/TextInput';

// Declare jspdf for TypeScript since it's loaded from a script tag
declare const jspdf: any;

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
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // Fix: Replaced 'LiveSession' with 'any' as the session type is not exported from the SDK.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const chatRef = useRef<Chat | null>(null);
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    chatRef.current = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: "Você é um assistente de IA especialista em programação. Seu objetivo é ajudar os usuários a escrever código, resolver problemas e entender conceitos de programação em qualquer linguagem. Se arquivos forem fornecidos, baseie suas respostas primordialmente no conteúdo desses arquivos. Ao fornecer código, sempre o envolva em blocos de código Markdown com a identificação da linguagem. Por exemplo: ```javascript\nconsole.log('Olá, Mundo!');\n```. Mantenha as explicações em texto concisas e focadas no código. Responda em português do Brasil.",
        },
    });

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
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const pdfFiles = files.filter(file => file.type === 'application/pdf');

      if (pdfFiles.length < files.length) {
        setError("Apenas arquivos PDF são suportados. Outros tipos de arquivo foram ignorados.");
      } else {
        setError(null); // Clear error if all files are valid
      }

      setUploadedFiles(pdfFiles);
    }
  };

  const fileToGenerativePart = async (file: File) => {
    const base64EncodedData = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: {
        data: base64EncodedData,
        mimeType: file.type,
      },
    };
  };

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
                const assistantText = currentAssistantTranscriptionRef.current;
                const userText = currentUserTranscriptionRef.current;
                
                const codeRegex = /```(\w+)?\s*\n([\s\S]+?)\n```/;
                const match = assistantText.match(codeRegex);

                let newEntry: TranscriptionEntry;

                if (match) {
                  newEntry = {
                    user: userText,
                    assistant: assistantText.replace(codeRegex, '').trim(),
                    code: {
                      language: match[1] || 'plaintext',
                      content: match[2].trim(),
                    }
                  };
                } else {
                  newEntry = {
                    user: userText,
                    assistant: assistantText,
                  };
                }
                
                setTranscriptionHistory(prev => [...prev, newEntry]);
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
          systemInstruction: "Você é um assistente de IA especialista em programação. Seu objetivo é ajudar os usuários a escrever código, resolver problemas e entender conceitos de programação em qualquer linguagem. Ao fornecer código, sempre o envolva em blocos de código Markdown com a identificação da linguagem. Por exemplo: ```javascript\nconsole.log('Olá, Mundo!');\n```. Mantenha as explicações em texto concisas e focadas no código. Responda em português do Brasil.",
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

  const handleTextSubmit = async (text: string) => {
    if (!chatRef.current || status !== AssistantStatus.IDLE) return;
    
    setStatus(AssistantStatus.THINKING);
    setError(null);
    
    setTranscriptionHistory(prev => [...prev, { user: text, assistant: '' }]);
    
    try {
        const messageParts: Part[] = [{ text }];

        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                const filePart = await fileToGenerativePart(file);
                messageParts.push(filePart);
            }
        }
        
        const responseStream = await chatRef.current.sendMessageStream({ message: messageParts });
        
        setStatus(AssistantStatus.SPEAKING); 
        
        let fullResponse = '';
        for await (const chunk of responseStream) {
            fullResponse += chunk.text;
            // Update the last entry in history for streaming effect
            setTranscriptionHistory(prev => {
                const newHistory = [...prev];
                const lastEntry = newHistory[newHistory.length - 1];
                if (lastEntry) {
                    lastEntry.assistant = fullResponse;
                }
                return newHistory;
            });
        }
        
        const codeRegex = /```(\w+)?\s*\n([\s\S]+?)\n```/;
        const match = fullResponse.match(codeRegex);

        let assistantText = fullResponse;
        let codeBlock;

        if (match) {
            assistantText = fullResponse.replace(codeRegex, '').trim();
            codeBlock = {
                language: match[1] || 'plaintext',
                content: match[2].trim(),
            };
        }
        
        setTranscriptionHistory(prev => {
            const newHistory = [...prev];
            const lastEntry = newHistory[newHistory.length - 1];
            if (lastEntry) {
                lastEntry.assistant = assistantText;
                lastEntry.code = codeBlock;
            }
            return newHistory;
        });

    } catch (err) {
        console.error('Text generation error:', err);
        setError('Ocorreu um erro ao gerar a resposta. Por favor, tente novamente.');
        setTranscriptionHistory(prev => prev.slice(0, -1)); // Remove the user's prompt on error
    } finally {
        setCurrentAssistantTranscription('');
        setUploadedFiles([]);
        setStatus(AssistantStatus.IDLE);
    }
  };
  
    const handleDownloadPDF = () => {
        try {
            const { jsPDF } = jspdf;
            const doc = new jsPDF();
            const margin = 10;
            const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
            let y = margin;

            const addText = (text: string, size = 12, style = 'normal', color = '#000000') => {
                if (y > 280) { // Simple page break check
                    doc.addPage();
                    y = margin;
                }
                doc.setFont('helvetica', style);
                doc.setFontSize(size);
                doc.setTextColor(color);
                const lines = doc.splitTextToSize(text, maxWidth);
                doc.text(lines, margin, y);
                y += (lines.length * (size / 2.5));
            };

            addText('Histórico da Conversa - Assistente de Código', 16, 'bold');
            y += 10;

            transcriptionHistory.forEach(entry => {
                addText(`Você: ${entry.user}`, 12, 'bold', '#007BFF');
                y += 2;
                if (entry.assistant) {
                  addText(`Assistente: ${entry.assistant}`);
                  y += 2;
                }
                if (entry.code) {
                    doc.setFont('courier', 'normal');
                    doc.setFontSize(10);
                    doc.setTextColor('#333333');
                    const codeLines = doc.splitTextToSize(entry.code.content, maxWidth - 5); // smaller width for code
                    doc.text(codeLines, margin + 5, y);
                    y += (codeLines.length * 4);
                }
                y += 8; // Spacing between entries
            });

            doc.save('historico-conversa.pdf');
        } catch (e) {
            console.error("Failed to generate PDF:", e);
            setError("Não foi possível gerar o PDF. A biblioteca pode não ter sido carregada.");
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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 space-y-4">
      <header className="text-center w-full max-w-4xl flex justify-between items-center">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-green-400">
            Assistente de Código
          </h1>
          <p className="text-gray-400 mt-2">Seu assistente de programação com IA</p>
        </div>
        <button
          onClick={handleDownloadPDF}
          disabled={transcriptionHistory.length === 0}
          className="px-4 py-2 rounded-lg flex items-center space-x-2 text-sm font-semibold bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
          title="Baixar conversa em PDF"
        >
          <DownloadIcon />
          <span>PDF</span>
        </button>
      </header>

      <VirtualAssistantAvatar status={status} />

      <TranscriptionDisplay
        history={transcriptionHistory}
        currentUserTranscription={currentUserTranscription}
        currentAssistantTranscription={currentAssistantTranscription}
      />
      
       <div className="w-full max-w-4xl space-y-2">
            <div className="flex items-center space-x-4">
                <label htmlFor="file-upload" className="flex-shrink-0 cursor-pointer px-4 py-2 rounded-lg flex items-center space-x-2 text-sm font-semibold bg-gray-700 hover:bg-gray-600 transition-colors">
                    <UploadIcon />
                    <span>Anexar Arquivos</span>
                </label>
                <input id="file-upload" type="file" multiple accept=".pdf" className="hidden" onChange={handleFileChange} disabled={status !== AssistantStatus.IDLE} />
                <div className="flex-grow bg-gray-800/50 rounded-lg p-2 text-xs text-gray-400 overflow-x-auto whitespace-nowrap">
                    {uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name).join(', ') : 'Nenhum arquivo selecionado (somente .pdf)'}
                </div>
            </div>
            <TextInput 
              onSubmit={handleTextSubmit}
              disabled={status !== AssistantStatus.IDLE}
            />
       </div>

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
const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
);
const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0L8 8m4-4v12" /></svg>
);

export default App;