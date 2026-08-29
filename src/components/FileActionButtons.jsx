import React from "react";
import EyeIcon from "./EyeIcon";

export default function FileActionButtons({ onView, onDownload, viewTitle = "View file", downloadTitle = "Download file" }) {
  return (
    <div className="file-action-buttons">
      <button type="button" className="file-action-button view" title={viewTitle} aria-label={viewTitle} onClick={onView}>
        <EyeIcon />
      </button>
      {onDownload && (
        <button type="button" className="file-action-button download" title={downloadTitle} aria-label={downloadTitle} onClick={onDownload}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
        </button>
      )}
    </div>
  );
}
