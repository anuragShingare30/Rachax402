import { motion } from 'framer-motion';
import { useMarketplaceStore, type ServiceType } from '../store/useMarketplaceStore';

const services: { id: ServiceType; icon: string; title: string; desc: string; cost: string; agent: string; borderColor: string; costColor: string }[] = [
  {
    id: 'analyze',
    icon: '📊',
    title: 'Analyze CSV',
    desc: 'Statistical analysis with insights',
    cost: '$0.01 USDC',
    agent: 'Agent Data Analyzer',
    borderColor: 'border-violet',
    costColor: 'text-violet',
  },
  {
    id: 'store',
    icon: '💾',
    title: 'Upload File',
    desc: 'Decentralized IPFS storage',
    cost: '$0.1 USDC',
    agent: 'Agent Storacha',
    borderColor: 'border-orange',
    costColor: 'text-orange',
  },
  {
    id: 'retrieve',
    icon: '📥',
    title: 'Retrieve File',
    desc: 'Retrieve files from Storacha using CID',
    cost: '$0.005 USDC',
    agent: 'Agent Storacha',
    borderColor: 'border-green',
    costColor: 'text-green',
  },
];

const ServiceSelector = () => {
  const { service, setService } = useMarketplaceStore();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h2 className="text-lg font-semibold text-foreground mb-4">Choose Service</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map((s: { id: ServiceType; icon: string; title: string; desc: string; cost: string; agent: string; borderColor: string; costColor: string }) => (
          <motion.button
            key={s.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setService(s.id)}
            className={`p-6 rounded-xl border-2 transition-all text-left ${
              service === s.id
                ? `${s.borderColor} bg-card/80 ring-2 ring-primary/20`
                : 'border-border bg-card/50 hover:border-muted-foreground/30'
            }`}
          >
            <div className="text-4xl mb-3">{s.icon}</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">{s.title}</h3>
            <p className="text-sm text-muted-foreground mb-3">{s.desc}</p>
            <div className="flex items-center justify-between">
              <span className={`font-semibold ${s.costColor}`}>{s.cost}</span>
              <span className="text-xs text-muted-foreground">{s.agent}</span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default ServiceSelector;
