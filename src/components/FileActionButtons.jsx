import React from "react";
import EyeIcon from "./EyeIcon";

export default function FileActionButtons({ onView, onDownload, viewTitle = "View file", downloadTitle = "Download file" }) {
  const buttonStyle = {
    display: "inline-flex",
    visibility: "visible",
    opacity: 1,
    width: "40px",
    minWidth: "40px",
    height: "40px",
    padding: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "7px",
    cursor: "pointer",
  };
  return (
    <div className="file-action-buttons" style={{ display: "inline-flex", visibility: "visible", alignItems: "center", gap: "8px" }}>
      <button type="button" className="file-action-button view" style={{ ...buttonStyle, background: "#fff", color: "#172638", border: "1px solid #d5e1ed" }} title={viewTitle} aria-label={viewTitle} onClick={onView}>
        <EyeIcon />
      </button>
      {onDownload && (
        <button type="button" className="file-action-button download" style={{ ...buttonStyle, background: "#172638", color: "#fff", border: "1px solid #172638" }} title={downloadTitle} aria-label={downloadTitle} onClick={onDownload}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="#fff" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
        </button>
      )}
    </div>
  );
}
