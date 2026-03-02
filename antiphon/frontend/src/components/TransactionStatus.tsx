import { motion } from 'framer-motion';
import { useMarketplaceStore } from '../store/useMarketplaceStore';

const TransactionStatus = () => {
  const { txHash, error, setError, currentStep } = useMarketplaceStore();

  const isValidTxHash = txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash);
  if (!isValidTxHash && !error) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-2">
      {isValidTxHash && txHash && currentStep > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-lg bg-indigo/10 border border-indigo/30 text-sm"
        >
          <span className="text-indigo">💳</span>
          <span className="text-muted-foreground">Base Sepolia Txn Hash:</span>
          <a
            href={`https://sepolia.basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-indigo hover:underline truncate"
          >
            {`${txHash.slice(0, 10)}...${txHash.slice(-8)}`}
          </a>
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-3 rounded-lg bg-error/10 border border-error/30 text-sm"
        >
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span className="text-error">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs px-3 py-1 rounded-md bg-error/20 text-error hover:bg-error/30 transition"
          >
            Dismiss
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default TransactionStatus;
