
import { Component, ChangeDetectionStrategy, signal, computed, inject, WritableSignal, ViewChild, ElementRef } from '@angular/core';
import { GeminiService, LensType } from '../../services/gemini.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface Lens {
  name: LensType;
  color: string;
  bgColor: string;
  icon: string;
}

interface ConversationEntry {
  id: number;
  from: 'user' | 'ai';
  content: string;
}

interface Idea {
  id: number;
  content: string;
  isEditing: boolean;
  isRefining: boolean;
  iconSvg?: string;
  isGeneratingIcon?: boolean;
}

@Component({
  selector: 'app-studio',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  host: {
    '(window:keydown)': 'handleKeyboardEvents($event)'
  }
})
export class StudioComponent {
  private geminiService = inject(GeminiService);

  lenses: Lens[] = [
    { name: 'Logic', color: 'text-sky-400', bgColor: 'bg-sky-900/50', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3.75H19.5M8.25 6.75H19.5M8.25 9.75H19.5M8.25 12.75H19.5m-11.25-9 3 3-3 3m-3.75-3h4.5m-4.5 6.75h4.5m-4.5 3h4.5m-4.5 3h4.5m-7.5-6h7.5" /></svg>` },
    { name: 'Intuition', color: 'text-indigo-400', bgColor: 'bg-indigo-900/50', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>` },
    { name: 'Emotion', color: 'text-rose-400', bgColor: 'bg-rose-900/50', icon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 mr-2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>` },
  ];

  seedIdea = signal('A city that lives in harmony with nature.');
  
  logicIdeas = signal<Idea[]>([]);
  intuitionIdeas = signal<Idea[]>([]);
  emotionIdeas = signal<Idea[]>([]);

  synthesisTitle = signal('');
  synthesisResult = signal('');
  isSynthesizing = signal(false);
  
  copiedIdeaId = signal<number | null>(null);
  private nextIdeaId = 0;

  isGeneratingIdeas = signal(false);
  selectedLenses = signal<Set<LensType>>(new Set());
  globalError = signal<string | null>(null);

  // Voice conversation state
  @ViewChild('waveformCanvas') waveformCanvas: ElementRef<HTMLCanvasElement> | undefined;
  isRecording = signal(false);
  isProcessingAudio = signal(false);
  conversationLog = signal<ConversationEntry[]>([]);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private nextConversationEntryId = 0;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private silenceStart = 0;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private readonly REQUIRED_SILENCE_DURATION = 1500; // in ms

  // Vision Studio State
  activeVisionTab = signal<'analyze' | 'generateImage' | 'generateVideo'>('analyze');
  // Analyze
  imageToAnalyze = signal<{ file: File, dataUrl: string } | null>(null);
  analysisPrompt = signal("Describe this image. What is the main subject? What is the mood?");
  analysisResult = signal('');
  isAnalyzing = signal(false);
  // Generate Image
  imageGenerationPrompt = signal('A photorealistic image of a futuristic city in harmony with nature, cinematic lighting.');
  aspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  selectedAspectRatio = signal('1:1');
  generatedImageUrl = signal('');
  isGeneratingImage = signal(false);
  // Generate Video
  imageToAnimate = signal<{ file: File, dataUrl: string } | null>(null);
  videoPrompt = signal('A gentle breeze rustles the leaves of the trees.');
  generatedVideoUrl = signal('');
  isGeneratingVideo = signal(false);
  videoGenerationStatus = signal('');
  private videoPollInterval: any;

  canSynthesize = computed(() => {
    const ideaLists = [this.logicIdeas(), this.intuitionIdeas(), this.emotionIdeas()];
    return ideaLists.filter(list => list.length > 0).length >= 2;
  });

  handleKeyboardEvents(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    // Don't trigger shortcuts if user is typing in a textarea or input
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return;
    }

    const isModifier = event.metaKey || event.ctrlKey;
    if (isModifier) {
      switch (event.key) {
        case '1':
          event.preventDefault();
          this.toggleLensSelection('Logic');
          break;
        case '2':
          event.preventDefault();
          this.toggleLensSelection('Intuition');
          break;
        case '3':
          event.preventDefault();
          this.toggleLensSelection('Emotion');
          break;
        case 'Enter':
          event.preventDefault();
          this.generateForSelectedLenses();
          break;
        case 's':
          event.preventDefault();
          this.synthesize();
          break;
      }
    }
  }

  getLensIdeas(lens: LensType): WritableSignal<Idea[]> {
    switch (lens) {
      case 'Logic': return this.logicIdeas;
      case 'Intuition': return this.intuitionIdeas;
      case 'Emotion': return this.emotionIdeas;
    }
  }

  toggleLensSelection(lensName: LensType) {
    this.selectedLenses.update(lenses => {
      const newLenses = new Set(lenses);
      if (newLenses.has(lensName)) {
        newLenses.delete(lensName);
      } else {
        newLenses.add(lensName);
      }
      return newLenses;
    });
  }

  async generateForSelectedLenses() {
    const lenses = Array.from(this.selectedLenses());
    if (!this.seedIdea() || lenses.length === 0 || this.isGeneratingIdeas()) return;
    this.isGeneratingIdeas.set(true);
    this.globalError.set(null);

    try {
      const response = await this.geminiService.generateWithLenses(lenses, this.seedIdea());
      const ideas: Omit<Idea, 'id'>[] = response.text
        .split('\n')
        .map(line => line.trim().replace(/^\*|^-/g, '').trim())
        .filter(line => line.length > 0)
        .map(content => ({
            content: content,
            isEditing: false,
            isRefining: false,
            isGeneratingIcon: false,
        }));
      
      const targetLens = lenses[0];
      this.getLensIdeas(targetLens).update(current => [
        ...current, 
        ...ideas.map(idea => ({ ...idea, id: this.nextIdeaId++ }))
      ]);

    } catch (error) {
      console.error(`Error generating with selected lenses:`, error);
      this.globalError.set('An error occurred while generating ideas. Please try again.');
    } finally {
      this.isGeneratingIdeas.set(false);
    }
  }

  clearAllIdeas() {
    this.logicIdeas.set([]);
    this.intuitionIdeas.set([]);
    this.emotionIdeas.set([]);
  }

  async synthesize() {
    if (!this.canSynthesize() || this.isSynthesizing()) return;
    this.isSynthesizing.set(true);
    this.synthesisResult.set('');
    this.synthesisTitle.set('');
    this.globalError.set(null);

    try {
      const logic = this.logicIdeas().map(i => i.content);
      const intuition = this.intuitionIdeas().map(i => i.content);
      const emotion = this.emotionIdeas().map(i => i.content);
      
      const response = await this.geminiService.synthesizeIdeas(this.seedIdea(), logic, intuition, emotion);
      this.synthesisResult.set(response.text);

      const titleResponse = await this.geminiService.generateTitle(response.text);
      this.synthesisTitle.set(titleResponse.text.replace(/["']/g, ""));

    } catch (error) {
      console.error('Error synthesizing ideas:', error);
      this.globalError.set('An error occurred during synthesis. Please try again.');
    } finally {
      this.isSynthesizing.set(false);
    }
  }

  clearSynthesis() {
    this.synthesisResult.set('');
    this.synthesisTitle.set('');
  }

  startEditing(lens: LensType, ideaToEdit: Idea) {
    this.getLensIdeas(lens).update(ideas =>
      ideas.map(idea =>
        idea.id === ideaToEdit.id
          ? { ...idea, isEditing: true }
          : { ...idea, isEditing: false }
      )
    );
  }

  saveEdit(lens: LensType, ideaToSave: Idea, newContent: string) {
    if (newContent) {
      this.getLensIdeas(lens).update(ideas =>
        ideas.map(idea =>
          idea.id === ideaToSave.id
            ? { ...idea, content: newContent, isEditing: false }
            : idea
        )
      );
    } else {
      this.getLensIdeas(lens).update(ideas => ideas.filter(idea => idea.id !== ideaToSave.id));
    }
  }
  
  cancelEdit(lens: LensType, ideaToCancel: Idea) {
      this.getLensIdeas(lens).update(ideas =>
        ideas.map(idea =>
          idea.id === ideaToCancel.id ? { ...idea, isEditing: false } : idea
        )
      );
  }
  
  copyIdea(content: string, ideaId: number) {
    navigator.clipboard.writeText(content).then(() => {
      this.copiedIdeaId.set(ideaId);
      setTimeout(() => {
        if (this.copiedIdeaId() === ideaId) {
          this.copiedIdeaId.set(null);
        }
      }, 2000);
    }).catch(err => console.error('Failed to copy text: ', err));
  }

  async refineIdea(lens: LensType, ideaToRefine: Idea) {
    this.getLensIdeas(lens).update(ideas => ideas.map(i => i.id === ideaToRefine.id ? { ...i, isRefining: true } : i));
    this.globalError.set(null);
    try {
      const response = await this.geminiService.refineIdea(ideaToRefine.content, lens);
      this.getLensIdeas(lens).update(ideas => ideas.map(i => i.id === ideaToRefine.id ? { ...i, content: response.text, isRefining: false, isEditing: true } : i));
    } catch (error) {
      console.error('Error refining idea:', error);
      this.globalError.set('An error occurred while refining the idea.');
      this.getLensIdeas(lens).update(ideas => ideas.map(i => i.id === ideaToRefine.id ? { ...i, isRefining: false } : i));
    }
  }

  async generateIcon(lens: LensType, ideaToIconify: Idea) {
    this.getLensIdeas(lens).update(ideas => ideas.map(i => i.id === ideaToIconify.id ? { ...i, isGeneratingIcon: true } : i));
    this.globalError.set(null);
    try {
      const response = await this.geminiService.generateIconForIdea(ideaToIconify.content, lens);
      let svgText = response.text.trim();
      if (svgText.startsWith('<svg') && svgText.endsWith('</svg>')) {
         this.getLensIdeas(lens).update(ideas => ideas.map(i => i.id === ideaToIconify.id ? { ...i, iconSvg: svgText, isGeneratingIcon: false } : i));
      } else {
        throw new Error("Invalid SVG format received.");
      }
    } catch (error) {
      console.error('Error generating icon:', error);
      this.globalError.set('Failed to generate a valid icon.');
      this.getLensIdeas(lens).update(ideas => ideas.map(i => i.id === ideaToIconify.id ? { ...i, isGeneratingIcon: false } : i));
    }
  }

  toggleRecording() {
    if (this.isRecording()) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  private async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isRecording.set(true);
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      source.connect(this.analyser);
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = event => {
        this.audioChunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => this.processAudio();
      this.mediaRecorder.start();
      this.silenceStart = Date.now();
      this.visualize();
    } catch (error) {
      this.isRecording.set(false);
      console.error("Error accessing microphone:", error);
      this.globalError.set("Microphone access was denied. Please check browser permissions.");
    }
  }

  private stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isRecording.set(false);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.mediaRecorder) {
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private visualize() {
    if (!this.analyser || !this.dataArray || !this.isRecording()) return;
    this.animationFrameId = requestAnimationFrame(() => this.visualize());
    this.analyser.getByteTimeDomainData(this.dataArray);
    
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
        const v = this.dataArray[i] - 128;
        sum += v * v;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);
    if (rms > 1.5) this.silenceStart = Date.now();
    if (Date.now() - this.silenceStart > this.REQUIRED_SILENCE_DURATION) {
        this.isProcessingAudio.set(true);
        this.stopRecording();
        return;
    }

    if (!this.waveformCanvas) return;
    const canvas = this.waveformCanvas.nativeElement;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const { width, height } = canvas;
    canvasCtx.clearRect(0, 0, width, height);
    
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    canvasCtx.beginPath();

    const sliceWidth = (width * 1.0) / this.dataArray.length;
    let x = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const v = this.dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    canvasCtx.lineTo(width, height / 2);
    canvasCtx.stroke();
  }

  private async processAudio() {
    if (this.audioChunks.length === 0) {
      this.isProcessingAudio.set(false);
      return;
    }
    this.isProcessingAudio.set(true);
    this.globalError.set(null);
    this.conversationLog.update(log => [...log, { id: this.nextConversationEntryId++, from: 'user', content: '🎤 Voice Input' }]);
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    try {
      const base64String = await this.blobToBase64(audioBlob) as string;
      const base64 = base64String.split(',')[1];
      const response = await this.geminiService.generateFromAudio(base64, audioBlob.type);
      const aiText = response.text;
      this.conversationLog.update(log => [...log, { id: this.nextConversationEntryId++, from: 'ai', content: '' }]);
      this.speakAndStream(aiText);
    } catch (error) {
      console.error('Error processing audio:', error);
      this.globalError.set('Sorry, I had trouble understanding that. Please try again.');
    } finally {
      this.isProcessingAudio.set(false);
    }
  }
  
  private blobToBase64(blob: Blob): Promise<string | ArrayBuffer | null> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private speakAndStream(text: string) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const spokenText = text.substring(0, event.charIndex + event.charLength);
          this.conversationLog.update(log => {
            const lastEntry = log[log.length - 1];
            if (lastEntry && lastEntry.from === 'ai') {
              return [...log.slice(0, -1), { ...lastEntry, content: spokenText }];
            }
            return log;
          });
        }
      };
      utterance.onend = () => {
        this.conversationLog.update(log => {
          const lastEntry = log[log.length - 1];
          if (lastEntry && lastEntry.from === 'ai') {
            return [...log.slice(0, -1), { ...lastEntry, content: text }];
          }
          return log;
        });
      };
      window.speechSynthesis.speak(utterance);
    } else {
      this.conversationLog.update(log => {
        const lastEntry = log[log.length - 1];
        if (lastEntry && lastEntry.from === 'ai') {
          return [...log.slice(0, -1), { ...lastEntry, content: text }];
        }
        return log;
      });
    }
  }

  // --- Vision Studio Methods ---

  onFileSelected(event: Event, type: 'analyze' | 'animate') {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (type === 'analyze') {
          this.imageToAnalyze.set({ file, dataUrl });
        } else {
          this.imageToAnimate.set({ file, dataUrl });
        }
      };
      reader.readAsDataURL(file);
    }
  }

  async analyzeImage() {
    const imageInfo = this.imageToAnalyze();
    if (!imageInfo) return;
    this.isAnalyzing.set(true);
    this.analysisResult.set('');
    this.globalError.set(null);
    try {
      const base64String = imageInfo.dataUrl.split(',')[1];
      const response = await this.geminiService.analyzeImage(base64String, imageInfo.file.type, this.analysisPrompt());
      this.analysisResult.set(response.text);
    } catch (error) {
      console.error('Error analyzing image:', error);
      this.globalError.set('Sorry, an error occurred while analyzing the image.');
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  async generateImage() {
    if (!this.imageGenerationPrompt()) return;
    this.isGeneratingImage.set(true);
    this.generatedImageUrl.set('');
    this.globalError.set(null);
    try {
      const response = await this.geminiService.generateImage(this.imageGenerationPrompt(), this.selectedAspectRatio());
      const base64Image = response.generatedImages[0].image.imageBytes;
      this.generatedImageUrl.set(`data:image/png;base64,${base64Image}`);
    } catch (error) {
      console.error('Error generating image:', error);
      this.globalError.set('Sorry, an error occurred while generating the image.');
    } finally {
      this.isGeneratingImage.set(false);
    }
  }

  async generateVideo() {
    const imageInfo = this.imageToAnimate();
    if (!imageInfo) return;
    this.isGeneratingVideo.set(true);
    this.generatedVideoUrl.set('');
    this.videoGenerationStatus.set('Initializing video generation...');
    this.globalError.set(null);
    try {
      const base64String = imageInfo.dataUrl.split(',')[1];
      let operation = await this.geminiService.generateVideo(base64String, imageInfo.file.type, this.videoPrompt());
      this.videoGenerationStatus.set('Video processing started. This may take a few minutes...');
      
      this.videoPollInterval = setInterval(async () => {
        try {
            operation = await this.geminiService.getVideosOperation({ operation: operation });
            if (operation.done) {
                clearInterval(this.videoPollInterval);
                const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
                if (downloadLink) {
                    const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                    if (!videoResponse.ok) throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
                    const videoBlob = await videoResponse.blob();
                    this.generatedVideoUrl.set(URL.createObjectURL(videoBlob));
                    this.videoGenerationStatus.set('Video generation complete!');
                } else {
                    throw new Error('Video generation finished but no URI was returned.');
                }
                this.isGeneratingVideo.set(false);
            } else {
                this.videoGenerationStatus.set('Still processing... Please be patient.');
            }
        } catch(pollError) {
             console.error('Error polling video status:', pollError);
             this.videoGenerationStatus.set('An error occurred while checking video status.');
             this.globalError.set('An error occurred while checking video status.');
             this.isGeneratingVideo.set(false);
             clearInterval(this.videoPollInterval);
        }
      }, 10000);

    } catch (error) {
      console.error('Error generating video:', error);
      this.videoGenerationStatus.set('An error occurred while starting the video generation.');
      this.globalError.set('An error occurred while starting the video generation.');
      this.isGeneratingVideo.set(false);
      if (this.videoPollInterval) clearInterval(this.videoPollInterval);
    }
  }
}
