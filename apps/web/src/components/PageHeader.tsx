import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  backLabel?: string;
  onBack?: () => void;
  className?: string;
}

export default function PageHeader({ 
  title, 
  backTo, 
  backLabel = 'Back',
  onBack,
  className = '' 
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={`bg-sky-card border-b border-sky-border px-3 sm:px-4 py-2.5 ${className}`}>
      <div className="max-w-2xl mx-auto flex items-center gap-2">
        <button
          onClick={handleBack}
          className="flex min-w-[44px] min-h-[44px] items-center justify-center gap-1.5 text-sky-text-secondary hover:text-white transition-colors py-1.5 px-1 rounded-lg -ml-1"
          aria-label={backLabel}
        >
          <ArrowLeft size={20} className="flex-shrink-0" />
          <span className="text-sm font-medium hidden sm:inline">{backLabel}</span>
        </button>
        <h1 className="text-base sm:text-lg font-bold text-white flex-1 truncate">{title}</h1>
      </div>
    </div>
  );
}
