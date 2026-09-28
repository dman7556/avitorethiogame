import { useState, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  className?: string;
  autoComplete?: 'current-password' | 'new-password';
  disabled?: boolean;
}

export default function PasswordInput({
  label,
  placeholder = '••••••••',
  value,
  onChange,
  required = false,
  minLength,
  className = '',
  autoComplete = 'current-password',
  disabled = false,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleVisibility = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent losing focus
    setShowPassword(!showPassword);
    // Refocus the input after toggle
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleLabel = label ? label.toLowerCase().replace(/\s+/g, '-') : 'password';

  return (
    <div className={className}>
      {label && (
        <label htmlFor={`pwd-${handleLabel}`} className="block text-sm text-sky-text-secondary mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={`pwd-${handleLabel}`}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
          className="w-full bg-sky-card border border-sky-border rounded-xl px-4 py-3 pr-12 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={disabled}
          className="absolute right-0 top-1/2 transform -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg hover:bg-sky-card-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff size={18} className="text-sky-text-secondary" />
          ) : (
            <Eye size={18} className="text-sky-text-secondary" />
          )}
        </button>
      </div>
    </div>
  );
}
