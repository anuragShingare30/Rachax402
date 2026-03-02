import { motion, AnimatePresence } from 'framer-motion';
import { useMarketplaceStore } from '../store/useMarketplaceStore';
import { useAccount, usePublicClient, useSignTypedData } from 'wagmi';
import { createPaymentHeaders, getTransactionHashFromResponse, type WalletSigner } from '../lib/x402';
import { API_ENDPOINTS } from '../config/wagmi';

const PaymentModal = () => {
  const {
    service,
    paymentContext,
    showPaymentModal,
    setShowPaymentModal,
    setCurrentStep,
    setTxHash,
    setIsProcessing,
    setError,
    setAnalysisResults,
    setStorageResults,
    setInputCID,
    setPaymentContext,
    file,
  } = useMarketplaceStore();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  const amount =
    paymentContext?.forService === 'analyze' ? '$0.01' : '$0.1';
  const recipient =
    paymentContext?.forService === 'analyze'
      ? '0xEAB...E35B5f6c9'
      : '0x9D4...59371D0f8';

  const handleSign = async () => {
    if (!paymentContext || !address) return;

    const signer: WalletSigner = {
      address: address as `0x${string}`,
      signTypedDataAsync: (opts) =>
        signTypedDataAsync({
          ...opts,
          account: address,
        } as Parameters<typeof signTypedDataAsync>[0]),
    };

    const publicClientLike = publicClient
      ? (publicClient as unknown as import('../lib/x402').PublicClientLike)
      : undefined;

    try {
      const paymentHeaders = await createPaymentHeaders(
        paymentContext.paymentRequired,
        signer,
        publicClientLike
      );

      const init = paymentContext.buildInit();
      const res = await fetch(paymentContext.url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...paymentHeaders },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || `Request failed: ${res.status}`);
      }

      const txHashFromRes = getTransactionHashFromResponse(res);
      if (txHashFromRes) setTxHash(txHashFromRes);

      const data = await res.json();
      setPaymentContext(null);
      setShowPaymentModal(false);

      if (paymentContext.forService === 'upload') {
        const cid = data.data?.cid || data.cid;
        if (service === 'analyze') {
          setInputCID(cid || '');
          const analyzeBody = {
            inputCID: cid,
            requirements: 'statistical summary and trend analysis',
          };
          const analyzeRes = await fetch(API_ENDPOINTS.analyze, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(analyzeBody),
          });

          if (analyzeRes.status === 402) {
            const paymentRequired =
              analyzeRes.headers.get('payment-required') ||
              analyzeRes.headers.get('PAYMENT-REQUIRED');
            if (paymentRequired) {
              setPaymentContext({
                paymentRequired,
                url: API_ENDPOINTS.analyze,
                forService: 'analyze',
                buildInit: () => ({
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(analyzeBody),
                }),
              });
              setShowPaymentModal(true);
              return;
            }
          }

          if (!analyzeRes.ok) {
            const err = await analyzeRes.json().catch(() => ({}));
            throw new Error(err.message || err.error || 'Analysis failed');
          }
          const analyzeTxHash = getTransactionHashFromResponse(analyzeRes);
          if (analyzeTxHash) setTxHash(analyzeTxHash);
          const analyzeData = await analyzeRes.json();
          setAnalysisResults({
            summary: analyzeData.summary || '',
            statistics:
              analyzeData.statistics || {
                rowCount: 0,
                columnCount: 0,
                numericalStats: {},
              },
            insights: analyzeData.insights || [],
            resultCID: analyzeData.resultCID || '',
          });
          setCurrentStep(6);
        } else {
          const storeData = data.data || data;
          setStorageResults({
            cid: storeData.cid || '',
            fileName: file?.name || 'unknown',
            fileSize: file?.size || 0,
          });
          setCurrentStep(4);
        }
      } else {
        setAnalysisResults({
          summary: data.summary || '',
          statistics:
            data.statistics || {
              rowCount: 0,
              columnCount: 0,
              numericalStats: {},
            },
          insights: data.insights || [],
          resultCID: data.resultCID || '',
        });
        setCurrentStep(6);
      }
      setIsProcessing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed');
      setShowPaymentModal(false);
      setPaymentContext(null);
      setIsProcessing(false);
    }
  };

  if (!showPaymentModal || !paymentContext) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-md mx-4 p-6 rounded-2xl bg-card border-2 border-indigo/30 shadow-2xl"
        >
          <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
            💳 Payment Required
          </h3>

          <div className="flex justify-between items-center p-4 rounded-lg bg-secondary mb-4">
            <div>
              <div className="text-sm text-muted-foreground">Amount</div>
              <div className="text-2xl font-bold text-indigo">{amount}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Network</div>
              <div className="text-sm text-foreground">Base Sepolia</div>
            </div>
          </div>

          <div className="flex justify-between text-sm mb-6">
            <span className="text-muted-foreground">Recipient</span>
            <span className="font-mono text-foreground">{recipient}</span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowPaymentModal(false);
                setPaymentContext(null);
                setIsProcessing(false);
              }}
              className="flex-1 py-3 rounded-lg border border-border text-foreground font-semibold hover:bg-secondary transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSign}
              className="flex-1 py-3 rounded-lg bg-indigo text-foreground font-semibold hover:brightness-110 transition"
            >
              Sign & Pay
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PaymentModal;
