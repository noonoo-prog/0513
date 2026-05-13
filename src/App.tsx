import { useState, useCallback, useEffect, MouseEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  RotateCcw, 
  Sparkles, 
  Image as ImageIcon, 
  Cpu, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Loader2,
  Bookmark,
  Trash2,
  ExternalLink,
  History
} from 'lucide-react';
import { analyzeImage, generateSymbol, AnalysisResult } from './services/aiService';

type Status = 'idle' | 'uploading' | 'analyzing' | 'generating' | 'finished' | 'error';

interface SavedItem {
  id: string;
  original: string;
  symbol: string;
  analysis: AnalysisResult;
  date: number;
}

export default function App() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [generatedSymbol, setGeneratedSymbol] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isSaved, setIsSaved] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('symbol_archive');
    if (stored) {
      try {
        setSavedItems(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load archive', e);
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('symbol_archive', JSON.stringify(savedItems));
  }, [savedItems]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      setOriginalImage(reader.result as string);
      setStatus('analyzing');
      processImage(reader.result as string, file.type);
    };
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop: (files: File[]) => onDrop(files), 
    accept: { 'image/*': [] },
    multiple: false 
  } as any);

  const processImage = async (base64: string, type: string) => {
    try {
      // Step 1: Analyze
      setStatus('analyzing');
      const analysisResult = await analyzeImage(base64, type);
      setAnalysis(analysisResult);

      // Step 2: Generate
      setStatus('generating');
      const symbol = await generateSymbol(analysisResult.suggestedPrompt);
      setGeneratedSymbol(symbol);

      setStatus('finished');
    } catch (err) {
      console.error(err);
      setError('이미지 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
      setStatus('error');
    }
  };

  const reset = () => {
    setOriginalImage(null);
    setAnalysis(null);
    setGeneratedSymbol(null);
    setStatus('idle');
    setError(null);
    setIsSaved(false);
  };

  const saveToArchive = () => {
    if (!generatedSymbol || !originalImage || !analysis || isSaved) return;

    const newItem: SavedItem = {
      id: crypto.randomUUID(),
      original: originalImage,
      symbol: generatedSymbol,
      analysis,
      date: Date.now()
    };

    // Keep only last 5 to avoid localStorage size limits (base64 is heavy)
    const updated = [newItem, ...savedItems].slice(0, 5);
    setSavedItems(updated);
    setIsSaved(true);
  };

  const removeFromArchive = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setSavedItems(prev => prev.filter(item => item.id !== id));
  };

  const loadFromArchive = (item: SavedItem) => {
    setOriginalImage(item.original);
    setGeneratedSymbol(item.symbol);
    setAnalysis(item.analysis);
    setStatus('finished');
    setIsSaved(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const downloadImage = () => {
    if (!generatedSymbol) return;
    const link = document.createElement('a');
    link.href = generatedSymbol;
    link.download = 'symbol.png';
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] font-sans selection:bg-[#F27D26] selection:text-white">
      {/* Background Grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <header className="relative z-10 border-b border-[#1A1A1A] bg-[#0A0A0A]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#F27D26] rounded-sm flex items-center justify-center rotate-45">
              <Sparkles className="w-5 h-5 text-black -rotate-45" />
            </div>
            <h1 className="text-xl font-bold tracking-tighter uppercase italic">Symbol Maker</h1>
          </div>
          {status !== 'idle' && (
            <button 
              onClick={reset}
              className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#888] hover:text-[#F27D26] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto"
            >
              <div className="text-center mb-12">
                <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 uppercase italic">
                  Transform Visuals <br />
                  <span className="text-[#F27D26]">Into Symbols</span>
                </h2>
                <p className="text-[#888] text-lg max-w-md mx-auto">
                  사진이나 그림을 업로드하세요. <br /> AI가 특징을 분석하여 독창적인 심볼로 재탄생시킵니다.
                </p>
              </div>

              <div
                {...getRootProps()}
                className={`
                  relative border-2 border-dashed rounded-xl p-16 transition-all cursor-pointer
                  ${isDragActive ? 'border-[#F27D26] bg-[#F27D26]/5 scale-[1.01]' : 'border-[#222] hover:border-[#F27D26]/50'}
                `}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center border border-[#333]">
                    <Upload className="w-8 h-8 text-[#888]" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium">여기에 이미지를 드래그하거나 클릭하여 업로드</p>
                    <p className="text-sm text-[#888] mt-1 font-mono uppercase tracking-widest">JPG, PNG, WEBP (Max 10MB)</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {(status === 'analyzing' || status === 'generating' || status === 'finished') && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            >
              {/* Left Column: Input and Analysis */}
              <div className="space-y-8">
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 border border-[#333] flex items-center justify-center text-[10px] font-mono">01</div>
                    <h3 className="uppercase tracking-widest font-bold text-sm text-[#888]">Original Image</h3>
                  </div>
                  <div className="relative group rounded-xl overflow-hidden border border-[#222] bg-[#111] aspect-square flex items-center justify-center">
                    {originalImage ? (
                      <img src={originalImage} alt="Original" className="max-h-full object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-[#222]" />
                    )}
                  </div>
                </section>

                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 border border-[#333] flex items-center justify-center text-[10px] font-mono">02</div>
                    <h3 className="uppercase tracking-widest font-bold text-sm text-[#888]">Visual DNA Analysis</h3>
                  </div>
                  <div className="border border-[#222] bg-[#111] rounded-xl p-6 min-h-[200px]">
                    {status === 'analyzing' ? (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-[#888]">
                        <Loader2 className="w-8 h-8 animate-spin text-[#F27D26]" />
                        <p className="font-mono text-xs uppercase tracking-widest animate-pulse">Analyzing visual patterns...</p>
                      </div>
                    ) : analysis ? (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                      >
                        <div className="flex flex-wrap gap-2">
                          {analysis.features.map((feat, idx) => (
                            <span key={idx} className="px-3 py-1 bg-[#1A1A1A] border border-[#333] text-[11px] font-mono uppercase tracking-wider rounded-sm">
                              {feat}
                            </span>
                          ))}
                        </div>
                        <div>
                          <p className="text-sm leading-relaxed text-[#BBB]">
                            {analysis.explanation}
                          </p>
                        </div>
                        <div className="pt-4 border-t border-[#222]">
                          <div className="text-[10px] font-mono uppercase text-[#555] mb-2 tracking-widest">Neural Prompt Output</div>
                          <code className="text-xs text-[#F27D26] block p-3 bg-black/50 rounded overflow-x-auto whitespace-pre-wrap leading-tight">
                            {analysis.suggestedPrompt}
                          </code>
                        </div>
                      </motion.div>
                    ) : null}
                  </div>
                </section>
              </div>

              {/* Right Column: Generation Result */}
              <div className="space-y-8">
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-6 h-6 border border-[#333] flex items-center justify-center text-[10px] font-mono">03</div>
                    <h3 className="uppercase tracking-widest font-bold text-sm text-[#888]">Generated Symbol</h3>
                  </div>
                  <div className="relative aspect-square border-2 border-[#222] bg-[#111] rounded-xl overflow-hidden flex items-center justify-center group">
                    {status === 'generating' ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="relative w-20 h-20">
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 border-2 border-dashed border-[#F27D26] rounded-full opacity-50"
                          />
                          <div className="absolute inset-2 border border-[#333] rounded-full flex items-center justify-center">
                            <Cpu className="w-8 h-8 text-[#F27D26]/50" />
                          </div>
                        </div>
                        <p className="font-mono text-xs uppercase tracking-widest text-[#888] animate-pulse">Synthesizing graphic forms...</p>
                      </div>
                    ) : generatedSymbol ? (
                      <>
                        <motion.img 
                          initial={{ scale: 1.1, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          src={generatedSymbol} 
                          alt="Generated Symbol" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                          <button 
                            onClick={saveToArchive}
                            disabled={isSaved}
                            title="아카이브에 저장"
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSaved ? 'bg-[#10B981] text-white' : 'bg-white text-black hover:scale-110 active:scale-95'}`}
                          >
                            {isSaved ? <CheckCircle2 className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                          </button>
                          <button 
                            onClick={downloadImage}
                            className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <Layers className="w-12 h-12 text-[#222]" />
                    )}
                  </div>
                </section>

                <div className="border border-[#222] bg-[#F27D26]/5 rounded-xl p-6">
                  {status === 'finished' ? (
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#10B981]/20 border border-[#10B981]/30 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-[#10B981]" />
                      </div>
                      <div>
                        <h4 className="font-bold uppercase tracking-tight text-[#10B981]">Synthesis Complete</h4>
                        <p className="text-sm text-[#888] mt-1">심볼이 성공적으로 생성되었습니다. 이미지를 내려받거나 새로운 변환을 시작할 수 있습니다.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4 opacity-50">
                      <div className="w-10 h-10 rounded-full bg-[#333] flex items-center justify-center shrink-0">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                      <div>
                        <h4 className="font-bold uppercase tracking-tight text-[#555]">Process In Progress...</h4>
                        <p className="text-sm text-[#444] mt-1">AI의 연산이 끝날 때까지 잠시만 기다려 주세요.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {status === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto text-center py-12"
            >
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2 uppercase italic tracking-tighter">System Error</h2>
              <p className="text-[#888] mb-8">{error}</p>
              <button 
                onClick={reset}
                className="px-8 py-3 bg-[#F27D26] text-black font-bold uppercase tracking-widest text-sm hover:scale-105 active:scale-95 transition-all"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Archive Section */}
        {savedItems.length > 0 && (
          <motion.section 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-24 pt-12 border-t border-[#1A1A1A]"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-[#F27D26]" />
                <h3 className="text-xl font-bold uppercase italic tracking-tight">Saved Archive</h3>
              </div>
              <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">Recent 5 Items Stored Locally</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {savedItems.map((item) => (
                <motion.div
                  key={item.id}
                  layoutId={item.id}
                  onClick={() => loadFromArchive(item)}
                  className="group relative aspect-square bg-[#111] border border-[#222] rounded-lg overflow-hidden cursor-pointer hover:border-[#F27D26]/50 transition-all"
                >
                  <img src={item.symbol} alt="Stashed Symbol" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                  <div className="absolute top-2 right-2">
                    <button 
                      onClick={(e) => removeFromArchive(item.id, e)}
                      className="p-1.5 bg-black/50 text-[#555] hover:text-red-500 rounded backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-center text-[9px] font-mono uppercase text-white/50 tracking-tighter">
                      <span>{new Date(item.date).toLocaleDateString()}</span>
                      <ExternalLink className="w-3 h-3" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      <footer className="mt-auto border-t border-[#1A1A1A] py-8 text-center text-[#444] font-mono text-[10px] uppercase tracking-[0.3em]">
        © {new Date().getFullYear()} SYMBOL MAKER [NEURAL GRAPHICS ENGINE V2.5]
      </footer>
    </div>
  );
}

