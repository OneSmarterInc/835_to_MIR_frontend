import React from "react";
import ClaimSearchView from "../onesmarter_admin/components/ClaimSearchView";
import "./ClientClaimSearchView.css";

export default function ClientClaimSearchView() {
  return (
    <div className="client-claim-search-page">
      <ClaimSearchView
        clients={[]}
        activeClientId="self"
        onSelectClient={() => {}}
      />
    </div>
  );
}
