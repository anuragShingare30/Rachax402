import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMarketplaceStore, analysisSteps, storageSteps } from '../store/useMarketplaceStore';

// ── Icon map for each step type ──────────────────────────────────────────────
const stepIcons: Record<string, string> = {
  Submitted:  '📤',
  Discovery:  '🔍',
  Payment:    '💳',
  Processing: '⚙️',
  Reputation: '⭐',
  Results:    '✅',
  Complete:   '✅',
};

// ── Status badge per step ────────────────────────────────────────────────────
type StepStatus = 'done' | 'active' | 'pending';
function stepStatus(stepId: number, currentStep: number): StepStatus {
  if (stepId < currentStep) return 'done';
  if (stepId === currentStep) return 'active';
  return 'pending';
}

// ── Parse emoji prefix from log lines ────────────────────────────────────────
function logLineColor(line: string): string {
  if (line.startsWith('✅') || line.startsWith('🏆')) return 'text-green';
  if (line.startsWith('❌')) return 'text-red-400';
  if (line.startsWith('⭐')) return 'text-yellow-400';
  if (line.startsWith('💳')) return 'text-indigo';
  if (line.startsWith('🔍')) return 'text-emerald';
  if (line.startsWith('📤')) return 'text-orange';
  return 'text-muted-foreground';
}

const ProgressStepper = () => {
  const { service, currentStep, isProcessing, liveLog, txHash, error } =
    useMarketplaceStore();

  const steps = service === 'analyze' ? analysisSteps : storageSteps;
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveLog]);

  // Don't render before task starts
  if (currentStep === 0 && !error) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      {/* ── Step Progress Bar ──────────────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-card border border-border">
        <div className="flex items-start gap-0">
          {steps.map((step, idx) => {
            const status = stepStatus(step.id, currentStep);
            const isLast = idx === steps.length - 1;

            return (
              <div key={step.id} className="flex items-start flex-1">
                {/* Step node */}
                <div className="flex flex-col items-center min-w-[60px]">
                  <motion.div
                    initial={false}
                    animate={{
                      scale: status === 'active' ? [1, 1.1, 1] : 1,
                      opacity: status === 'pending' ? 0.4 : 1,
                    }}
                    transition={
                      status === 'active'
                        ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
                        : {}
                    }
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ${
                      status === 'done'
                        ? 'bg-success/20 border-success text-success'
                        : status === 'active'
                        ? 'bg-violet/20 border-violet text-violet ring-2 ring-violet/30'
                        : 'bg-card border-border text-muted-foreground'
                    }`}
                  >
                    {status === 'done' ? '✓' : stepIcons[step.label] ?? step.icon}
                  </motion.div>

                  {/* Label + desc */}
                  <div className="mt-2 text-center">
                    <div
                      className={`text-xs font-semibold ${
                        status === 'done'
                          ? 'text-success'
                          : status === 'active'
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5 max-w-[72px]">
                      {step.desc}
                    </div>
                  </div>
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div className="flex-1 mt-5 mx-1">
                    <motion.div
                      className="h-0.5 rounded-full"
                      initial={false}
                      animate={{
                        backgroundColor:
                          step.id < currentStep
                            ? 'rgb(34 197 94 / 0.6)' // success
                            : step.id === currentStep
                            ? 'rgb(139 92 246 / 0.4)' // violet
                            : 'rgb(255 255 255 / 0.1)', // muted
                      }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Live Terminal Log ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {(liveLog.length > 0 || isProcessing) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-[#0d1117] border border-white/10 overflow-hidden"
          >
            {/* Terminal title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-2 text-xs text-white/30 font-mono">
                agent-a-coordinator — live log
              </span>
              {isProcessing && (
                <span className="ml-auto flex items-center gap-1.5">
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-violet"
                  />
                  <span className="text-[10px] text-violet font-mono">running</span>
                </span>
              )}
            </div>

            {/* Log lines */}
            <div className="p-4 font-mono text-xs space-y-1 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              {liveLog.length === 0 && isProcessing ? (
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="text-muted-foreground"
                >
                  Initializing AgentA pipeline...
                </motion.div>
              ) : (
                liveLog.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`leading-relaxed ${logLineColor(line)}`}
                  >
                    <span className="text-white/20 mr-2 select-none">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {line}
                  </motion.div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Reputation tx hash ────────────────────────────────────────────── */}
      <AnimatePresence>
        {txHash && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-emerald/10 border border-emerald/30"
          >
            <span className="text-lg">⭐</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-emerald font-semibold mb-0.5">
                Reputation posted on-chain
              </div>
              <a
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-muted-foreground hover:text-foreground transition truncate block"
              >
                {txHash.slice(0, 20)}...{txHash.slice(-12)}
              </a>
            </div>
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald/20 text-emerald font-semibold hover:bg-emerald/30 transition whitespace-nowrap"
            >
              View on BaseScan ↗
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error state ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-red-500/10 border border-red-500/30"
          >
            <div className="flex items-start gap-3">
              <span className="text-lg">❌</span>
              <div>
                <div className="text-sm font-semibold text-red-400 mb-1">
                  Pipeline failed
                </div>
                <div className="text-xs text-muted-foreground font-mono">{error}</div>
                <div className="text-xs text-muted-foreground mt-2 opacity-70">
                  Check that AgentA (port 3001) and AgentB (ports 8000/8001) are running.
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProgressStepper;