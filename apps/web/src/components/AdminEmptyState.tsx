import React from 'react';
import { Search, AlertCircle } from 'lucide-react';

interface AdminEmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  onRetry?: () => void;
}

export default function AdminEmptyState({ 
  title, 
  description,
  icon = <Search size={32} className="text-sky-text-muted" />,
  onRetry
}: AdminEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      {description && (
        <p className="text-sky-text-secondary text-sm mb-6 max-w-sm text-center">
          {description}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-sky-green/10 border border-sky-green/30 rounded-lg text-sky-green hover:bg-sky-green/20 transition-colors text-sm font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}
