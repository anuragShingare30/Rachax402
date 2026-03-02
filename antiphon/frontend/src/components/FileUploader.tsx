import { useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMarketplaceStore } from '../store/useMarketplaceStore';

// ── Config (set VITE_AGENT_A_URL in .env.local) ─────────────────────────────
const AGENT_A_BASE = import.meta.env.VITE_AGENT_A_URL ?? 'http://localhost:3001';
const TASK_URL = `${AGENT_A_BASE}/api/task`;
const STREAM_URL = (taskId: string) => `${AGENT_A_BASE}/api/task/${taskId}/stream`;

// ── Step number → store currentStep mapping ──────────────────────────────────
// Server emits stepNum 1-6 (analyze) or 1-4 (storage).
// We pass it straight to setCurrentStep.
const mapStepNum = (stepNum: number) => stepNum;

const FileUploader = () => {
  const {
    service,
    file,
    setFile,
    setIsProcessing,
    setCurrentStep,
    setError,
    setTxHash,
    setDiscoveredAgent,
    setAnalysisResults,
    setStorageResults,
    setLiveLog,
  } = useMarketplaceStore();

  const [isDragging, setIsDragging] = useState(false);
  const [cidInput, setCidInput] = useState('');

  // Keep EventSource ref so we can close it on unmount / error
  const esRef = useRef<EventSource | null>(null);

  const cleanup = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  const runPipeline = async () => {
    if (service === 'retrieve' && !cidInput) return;
    if (service !== 'retrieve' && !file) return;

    cleanup(); // close any lingering SSE connection
    setError(null);
    setTxHash(null);
    setLiveLog([]);
    setIsProcessing(true);
    setCurrentStep(1);

    try {
      // ── Step A: POST to AgentA — returns taskId immediately ──────────────
      const formData = new FormData();
      formData.append(
        'service',
        service === 'analyze' ? 'analyze' : service === 'store' ? 'store' : 'retrieve'
      );
      if (file) formData.append('file', file);
      if (service === 'retrieve') formData.append('cid', cidInput);

      const postResp = await fetch(TASK_URL, { method: 'POST', body: formData });
      if (!postResp.ok) {
        const txt = await postResp.text().catch(() => postResp.statusText);
        throw new Error(`AgentA rejected task: ${txt}`);
      }

      const { taskId } = (await postResp.json()) as { taskId: string; success: boolean };
      if (!taskId) throw new Error('AgentA returned no taskId');

      // ── Step B: Open SSE stream for live updates ──────────────────────────
      await new Promise<void>((resolve, reject) => {
        const es = new EventSource(STREAM_URL(taskId));
        esRef.current = es;

        // Live step messages from the pipeline
        es.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data) as {
              stepNum: number;
              msg: string;
              liveLog: string[];
            };
            setCurrentStep(mapStepNum(data.stepNum));
            setLiveLog(data.liveLog);
          } catch {
            // non-JSON heartbeat, ignore
          }
        };

        // Pipeline finished successfully
        es.addEventListener('done', (evt) => {
          try {
            const result = JSON.parse((evt as MessageEvent).data) as {
              success: boolean;
              service: string;
              liveLog: string[];
              resultCID?: string;
              summary?: string;
              statistics?: {
                rowCount: number;
                columnCount: number;
                numericalStats: Record<string, {
                  mean: number;
                  median: number;
                  stdDev: number;
                  min: number;
                  max: number;
                }>;
              };
              insights?: string[];
              cid?: string;
              fileName?: string;
              fileSize?: number;
              reputationTxHash?: string;
              retrievedCID?: string;
              retrievedContentType?: string;
              retrievedDataBase64?: string;
            };

            if (result.liveLog) setLiveLog(result.liveLog);
            if (result.reputationTxHash) setTxHash(result.reputationTxHash);

            setDiscoveredAgent({
              address: result.liveLog
                ?.find((s) => s.includes('0x'))
                ?.match(/0x[a-fA-F0-9]{8,}/)?.[0] ?? 'on-chain',
              reputation: 0,
              totalRatings: 0,
              serviceName: result.service,
            });

            if (service === 'analyze' && result.resultCID) {
              setAnalysisResults({
                summary: result.summary ?? '',
                statistics: result.statistics ?? {
                  rowCount: 0,
                  columnCount: 0,
                  numericalStats: {},
                },
                insights: result.insights ?? [],
                resultCID: result.resultCID,
              });
              setCurrentStep(6);
            } else if (service === 'store' && result.cid) {
              setStorageResults({
                cid: result.cid,
                fileName: result.fileName ?? file?.name ?? '',
                fileSize: result.fileSize ?? file?.size ?? 0,
              });
              setCurrentStep(4);
            } else if (service === 'retrieve') {
              setStorageResults({
                cid: result.retrievedCID ?? '',
                fileName: 'retrieved-file',
                fileSize: result.retrievedDataBase64
                  ? Math.round((3 * result.retrievedDataBase64.length) / 4)
                  : 0,
                ...(result.retrievedDataBase64 && {
                  retrievedDataBase64: result.retrievedDataBase64,
                  retrievedContentType:
                    result.retrievedContentType ?? 'application/octet-stream',
                }),
              });
              setCurrentStep(4);
            }

            setIsProcessing(false);
            es.close();
            esRef.current = null;
            resolve();
          } catch (parseErr) {
            reject(new Error(`Failed to parse done event: ${parseErr}`));
          }
        });

        // Pipeline error
        es.addEventListener('error', (evt) => {
          try {
            const data = JSON.parse((evt as MessageEvent).data) as {
              error: string;
              liveLog: string[];
            };
            if (data.liveLog) setLiveLog(data.liveLog);
            reject(new Error(data.error));
          } catch {
            // SSE connection-level error (not a JSON message)
            reject(new Error('SSE connection failed — is AgentA running?'));
          }
          es.close();
          esRef.current = null;
        });

        // Timeout guard: if SSE never fires done/error within 90s
        const timeout = setTimeout(() => {
          reject(new Error('AgentA timed out after 90s'));
          es.close();
          esRef.current = null;
        }, 90_000);

        // Clear timeout once resolved/rejected
        const origResolve = resolve;
        const origReject = reject;
        // eslint-disable-next-line no-param-reassign
        resolve = (...args) => { clearTimeout(timeout); origResolve(...args); };
        // eslint-disable-next-line no-param-reassign
        reject = (...args) => { clearTimeout(timeout); origReject(...args); };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pipeline failed');
      setIsProcessing(false);
      cleanup();
    }
  };

  const canSubmit = service === 'retrieve' ? cidInput.length > 0 : !!file;

  return (
    <div className="max-w-2xl mx-auto px-6 py-4">
      {/* ── CID input for retrieve mode ──────────────────────────────────── */}
      {service === 'retrieve' ? (
        <div className="p-8 border-2 border-dashed rounded-xl border-border">
          <label className="block text-sm font-medium text-foreground mb-2">
            Enter CID to retrieve
          </label>
          <input
            type="text"
            value={cidInput}
            onChange={(e) => setCidInput(e.target.value)}
            placeholder="bafybei..."
            className="w-full px-4 py-3 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet font-mono text-sm"
          />
        </div>
      ) : (
        /* ── Drag & drop file zone ──────────────────────────────────────── */
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`p-8 border-2 border-dashed rounded-xl transition-all ${
            isDragging
              ? 'border-violet bg-violet/10'
              : 'border-border hover:border-muted-foreground/40'
          }`}
        >
          <input
            type="file"
            accept={service === 'analyze' ? '.csv' : '*'}
            onChange={handleFileSelect}
            className="hidden"
            id="file-input"
          />
          <label htmlFor="file-input" className="cursor-pointer block">
            <AnimatePresence mode="wait">
              {file ? (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="text-5xl mb-3 text-success">✓</div>
                  <div className="text-lg font-semibold text-foreground">{file.name}</div>
                  <div className="text-sm text-muted-foreground mt-2">
                    {(file.size / 1024).toFixed(2)} KB
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 opacity-60">
                    Click to change file
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="text-5xl mb-3 text-muted-foreground">↑</div>
                  <div className="text-lg text-foreground">
                    {service === 'analyze'
                      ? 'Upload CSV file for analysis'
                      : 'Upload any file to store on Storacha'}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    Click or drag & drop
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </label>
        </div>
      )}

      {canSubmit && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={runPipeline}
          className="w-full mt-4 py-4 bg-gradient-to-r from-violet to-indigo rounded-xl font-semibold text-foreground transition-all hover:brightness-110 active:scale-[0.99]"
        >
          {service === 'analyze'
            ? '⚡ Start Analysis'
            : service === 'store'
            ? '💾 Upload to Storacha'
            : '📥 Retrieve File'}
        </motion.button>
      )}

      <div className="mt-3 text-center text-xs text-muted-foreground">
        AgentA discovers, pays, and coordinates autonomously.{' '}
        <span className="text-green font-medium">No wallet required.</span>
      </div>
    </div>
  );
};

export default FileUploader;