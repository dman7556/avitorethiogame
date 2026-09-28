import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

export default function NotificationToast() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const handleDepositApproved = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { message, amount } = customEvent.detail;
      const id = Math.random().toString(36).substring(7);
      
      setNotifications((prev) => [
        ...prev,
        {
          id,
          type: 'success',
          message: `${message} • ${amount} ETB credited`,
          duration: 5000,
        },
      ]);

      // Auto-remove after duration
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 5000);
    };

    const handleDepositRejected = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { message } = customEvent.detail;
      const id = Math.random().toString(36).substring(7);
      
      setNotifications((prev) => [
        ...prev,
        {
          id,
          type: 'error',
          message: message,
          duration: 6000,
        },
      ]);

      // Auto-remove after duration
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 6000);
    };

    window.addEventListener('depositApproved', handleDepositApproved);
    window.addEventListener('depositRejected', handleDepositRejected);

    return () => {
      window.removeEventListener('depositApproved', handleDepositApproved);
      window.removeEventListener('depositRejected', handleDepositRejected);
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-40 space-y-2 max-w-sm pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm pointer-events-auto animate-in slide-in-from-top-4 fade-in ${
            notification.type === 'success'
              ? 'bg-sky-green/10 border-sky-green/30 text-sky-green'
              : 'bg-sky-red/10 border-sky-red/30 text-sky-red'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle size={18} className="flex-shrink-0" />
          ) : (
            <AlertCircle size={18} className="flex-shrink-0" />
          )}
          <p className="text-sm font-medium flex-1">{notification.message}</p>
          <button
            onClick={() =>
              setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
            }
            className="flex-shrink-0 p-1 hover:opacity-70 transition-opacity"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
