import React from "react";
//test
export default function Drawer({ isOpen, activeTab, onSelectTab, onClose }) {
  return (
    <>
      {/* Drawer Backdrop Overlay */}
      <div
        className={`drawer-backdrop ${isOpen ? "open" : ""}`}
        id="drawerBackdrop"
        onClick={onClose}
      ></div>

      {/* Left-to-Right Drawer Navigation Panel */}
      <nav className={`client-drawer ${isOpen ? "open" : ""}`} id="navDrawer" aria-label="Client navigation">
        <div className="grp eyebrow">Operations</div>
        <button
          className={`navitem ${activeTab === "flow" ? "on" : ""}`}
          data-v="flow"
          onClick={() => onSelectTab("flow")}
        >
          Flow
        </button>
        <button
          className={`navitem ${activeTab === "batches" ? "on" : ""}`}
          data-v="batches"
          onClick={() => onSelectTab("batches")}
        >
          Conversions
        </button>
        <button
          className={`navitem ${activeTab === "checks" ? "on" : ""}`}
          data-v="checks"
          onClick={() => onSelectTab("checks")}
        >
          Checks
        </button>
        <button
          className={`navitem ${activeTab === "notices" ? "on" : ""}`}
          data-v="notices"
          onClick={() => onSelectTab("notices")}
        >
          Notices from MPL <span className="count">3</span>
        </button>
        <div className="grp eyebrow" style={{ paddingTop: "18px" }}>
          Records
        </div>
        <button
          className={`navitem ${activeTab === "search" ? "on" : ""}`}
          data-v="search"
          onClick={() => onSelectTab("search")}
        >
          Search
        </button>
        <button
          className={`navitem ${activeTab === "archive" ? "on" : ""}`}
          data-v="archive"
          onClick={() => onSelectTab("archive")}
        >
          Archive
        </button>
        <button
          className={`navitem ${activeTab === "code-dictionary" ? "on" : ""}`}
          data-v="code-dictionary"
          onClick={() => onSelectTab("code-dictionary")}
        >
          Code Dictionary
        </button>
        <button
          className={`navitem ${activeTab === "result" ? "on" : ""}`}
          data-v="result"
          onClick={() => onSelectTab("result")}
        >
          Reconciliation
        </button>
        <div className="grp eyebrow" style={{ paddingTop: "18px" }}>
          Setup
        </div>
        <button
          className={`navitem ${activeTab === "conn" ? "on" : ""}`}
          data-v="conn"
          onClick={() => onSelectTab("conn")}
        >
          Connections
        </button>
        <button
          className={`navitem ${activeTab === "contacts" ? "on" : ""}`}
          data-v="contacts"
          onClick={() => onSelectTab("contacts")}
        >
          Contact Us
        </button>
      </nav>
    </>
  );
}
