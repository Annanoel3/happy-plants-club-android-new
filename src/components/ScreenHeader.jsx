import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function ScreenHeader({ title, subtitle, backUrl, extra }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backUrl) {
      navigate(backUrl);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={handleBack}
        className="p-2 rounded-xl hover:opacity-70 transition-opacity flex-shrink-0"
        style={{ color: "var(--theme-text, #2d3748)" }}
        aria-label="Go back"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold truncate" style={{ color: "var(--theme-text, #2d3748)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm truncate" style={{ color: "var(--theme-text-secondary, #718096)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {extra && <div className="flex-shrink-0">{extra}</div>}
    </div>
  );
}