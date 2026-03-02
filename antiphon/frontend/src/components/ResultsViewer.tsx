import { motion } from 'framer-motion';
import { useMarketplaceStore } from '../store/useMarketplaceStore';
import { useState } from 'react';

const ResultsViewer = () => {
  const { service, analysisResults, storageResults, currentStep, setShowRatingModal } = useMarketplaceStore();
  const [copied, setCopied] = useState(false);

  const showAnalysis = service === 'analyze' && analysisResults && currentStep >= 6;
  const showStorage = (service === 'store' || service === 'retrieve') && storageResults && currentStep >= 4;
  const isRetrieve = service === 'retrieve' && storageResults?.retrievedDataBase64;

  if (!showAnalysis && !showStorage) return null;

  const stats = analysisResults?.statistics;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto px-6 py-6 space-y-6"
    >
      {showAnalysis && analysisResults && (
        <>
          {/* Summary */}
          <div className="p-6 rounded-xl bg-success/10 border border-success/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-success rounded-full flex items-center justify-center">✓</div>
              <h2 className="text-2xl font-bold text-foreground">Analysis Complete!</h2>
            </div>
            <p className="text-muted-foreground">{analysisResults.summary}</p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-6 rounded-xl bg-card">
              <div className="text-sm text-muted-foreground mb-1">Rows Analyzed</div>
              <div className="text-3xl font-bold text-foreground">{stats?.rowCount ?? 0}</div>
            </div>
            <div className="p-6 rounded-xl bg-card">
              <div className="text-sm text-muted-foreground mb-1">Columns</div>
              <div className="text-3xl font-bold text-foreground">{stats?.columnCount ?? 0}</div>
            </div>
          </div>

          {/* Numerical stats */}
          {stats?.numericalStats && Object.keys(stats.numericalStats).length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Statistical Summary</h3>
            {Object.entries(stats.numericalStats).map(([col, colStats]: [string, { mean: number; median: number; stdDev: number; min: number; max: number }]) => (
              <div key={col} className="p-4 rounded-xl bg-card">
                <div className="font-semibold text-foreground mb-3 capitalize">{col}</div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  {(['mean', 'median', 'stdDev', 'min'] as const).map((k) => (
                    <div key={k}>
                      <div className="text-muted-foreground capitalize">{k === 'stdDev' ? 'Std Dev' : k}</div>
                      <div className="font-semibold text-violet">{typeof colStats[k] === 'number' ? colStats[k].toFixed(1) : colStats[k]}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}

          {/* Insights */}
          {analysisResults.insights && analysisResults.insights.length > 0 && (
            <div className="p-6 rounded-xl bg-orange/10 border border-orange/30">
              <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">💡 Insights</h3>
              <ul className="space-y-2">
                {analysisResults.insights.map((insight: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-orange font-semibold">{i + 1}.</span>
                    <span className="text-foreground">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {analysisResults.resultCID && (
          <div className="flex gap-4">
            <a
              href={`https://w3s.link/ipfs/${analysisResults.resultCID}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-3 bg-violet rounded-lg font-semibold text-foreground text-center hover:brightness-110 transition"
            >
              Download Full Report
            </a>
            <button
              onClick={() => setShowRatingModal(true)}
              className="px-6 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-secondary transition"
            >
              Rate Agent
            </button>
          </div>
          )}
        </>
      )}

      {showStorage && storageResults && (
        <div className="p-6 rounded-xl bg-success/10 border border-success/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-success rounded-full flex items-center justify-center">
              {isRetrieve ? '📥' : '💾'}
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              {isRetrieve ? 'File Retrieved Successfully' : 'File Stored Successfully'}
            </h2>
          </div>
          <div className="space-y-3">
            {storageResults.cid && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-card">
                <div>
                  <div className="text-xs text-muted-foreground">CID</div>
                  <div className="font-mono text-sm text-foreground">{storageResults.cid}</div>
                </div>
                <button
                  onClick={() => copyToClipboard(storageResults.cid)}
                  className="px-3 py-1.5 rounded-md bg-secondary text-sm font-medium text-foreground hover:bg-accent transition"
                >
                  {copied ? '✓ Copied' : 'Copy CID'}
                </button>
              </div>
            )}
            {isRetrieve && storageResults.retrievedDataBase64 && storageResults.retrievedContentType ? (
              <button
                onClick={() => {
                  const bin = atob(storageResults.retrievedDataBase64!);
                  const arr = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                  const blob = new Blob([arr], { type: storageResults.retrievedContentType! });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = storageResults.fileName || 'retrieved-file';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="block w-full py-3 bg-orange rounded-lg font-semibold text-foreground text-center hover:brightness-110 transition"
              >
                Download Retrieved File
              </button>
            ) : (
              storageResults.cid && (
                <a
                  href={`https://w3s.link/ipfs/${storageResults.cid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-3 bg-orange rounded-lg font-semibold text-foreground text-center hover:brightness-110 transition"
                >
                  View on IPFS
                </a>
              )
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ResultsViewer;
