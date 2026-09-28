import React from 'react';
import { Loader2 } from 'lucide-react';

interface AdminLoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export default function AdminLoadingSpinner({ 
  message = 'Loading...', 
  fullScreen = false 
}: AdminLoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <div className="min-h-screen bg-sky-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-sky-green mx-auto mb-4" />
          <p className="text-sky-text-secondary">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <Loader2 className="animate-spin h-8 w-8 text-sky-green mx-auto mb-3" />
        <p className="text-sky-text-secondary text-sm">{message}</p>
      </div>
    </div>
  );
}
