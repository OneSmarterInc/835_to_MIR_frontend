import React, { useState, useEffect, useRef } from 'react';
import StepRung from './StepRung';
import ClientSelectDropdown from './ClientSelectDropdown';
import { postStepData } from '../services/api';
import ConfirmModal from './modals/ConfirmModal';
import FeedbackModal from './modals/FeedbackModal';
import TimeDisplay from '../../components/TimeDisplay';

export default function OnboardingLadder({ client, steps, roles, clients, onSelectClient, onRefresh, onOpenNotes, onOpenRedo, onOpenAddRole }) {
  const [returnPrompt, setReturnPrompt] = useState({ isOpen: false, pendingKey: '', stepName: '' });
  const [ladderFeedback, setLadderFeedback] = useState({ isOpen: false, kind: 'ok', title: '', content: '' });
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'cross_tab_refresh') {
        sessionStorage.removeItem('pending_return_step');
        onRefresh();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [onRefresh]);

  useEffect(() => {
    if (hasScrolledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const focusStep = params.get('step') || (window.location.hash ? window.location.hash.replace('#step-', '') : null);
    if (focusStep && steps && steps.length > 0) {
      hasScrolledRef.current = true;
      const scrollTimer = setTimeout(() => {
        const displayStepElement = Array.from(document.querySelectorAll('[data-display-step-number]'))
          .find((node) => node.dataset.displayStepNumber === String(focusStep));
        const el = displayStepElement || document.getElementById(`step-${focusStep}`) || document.getElementById(`step-rung-${focusStep}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-flash');
          setTimeout(() => el.classList.remove('highlight-flash'), 2500);
        }
        try {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('step');
          cleanUrl.hash = '';
          window.history.replaceState({}, document.title, cleanUrl.toString());
        } catch (e) {}
      }, 300);
      return () => clearTimeout(scrollTimer);
    }
  }, [client?.id, steps]);

  useEffect(() => {
    const handleFocus = async () => {
      const pendingKey = sessionStorage.getItem('pending_return_step');
      if (pendingKey && client) {
        if (pendingKey === 'step_8_mapping') {
          // Do not prompt for step 8! It completes itself via the Save button.
          return;
        }
        sessionStorage.removeItem('pending_return_step');
        setReturnPrompt({
          isOpen: true,
          pendingKey,
          stepName: pendingKey.replace(/_/g, ' ').toUpperCase()
        });
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [client, onRefresh]);

  const handleConfirmPendingReturn = async () => {
    const pKey = returnPrompt.pendingKey;
    setReturnPrompt({ isOpen: false, pendingKey: '', stepName: '' });
    if (pKey && client) {
      try {
        await postStepData(`/clients/${encodeURIComponent(client.id)}/steps/${encodeURIComponent(pKey)}/complete/`, {});
        await onRefresh();
      } catch (err) {
        setLadderFeedback({ isOpen: true, kind: 'bad', title: 'Step Completion Error', content: err.message });
      }
    }
  };

  if (!client || !steps) {
    return (
      <section className="view on" id="v-onboard">
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-2)' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⏳ Loading Onboarding Ladder...</div>
          <p>Fetching client compliance state and onboarding steps...</p>
        </div>
      </section>
    );
  }

  const totalSteps = steps.length || 15;
  const doneCount = steps.filter(s => s.done).length;
  const inProgressStep = steps.find(s => s.inProgress);
  const activeStepNum = inProgressStep ? `Step ${inProgressStep.displayNumber ?? inProgressStep.id}` : (doneCount === totalSteps ? 'Complete' : '—');
  const activeStepTitle = inProgressStep ? inProgressStep.title : (doneCount === totalSteps ? `All ${totalSteps} Steps Complete` : '—');
  const stageName = (() => {
    const s = (client.stage || '').toLowerCase().replace(/[\s-]/g, '_');
    if (s === 'production') return 'Production';
    if (s === 'production_pending') return 'Production Pending';
    if (s === 'golive_pending' || s === 'go_live_pending') return 'Go Live Pending';
    if (s === 'onboarding_completed') return 'Onboarding Completed';
    return 'Onboarding Pending';
  })();

  const isPermanentlyOffboarded = String(client.stage || '').toLowerCase() === 'offboarded';

  if (isPermanentlyOffboarded) {
    return (
      <section className="view on onboarding-history-view" id="v-onboard">
        <div className="hdr-row onboarding-history-header"><div>
          <div className="eyebrow">Selected Client</div>
          <div className="onboarding-client-heading">
            <div className="onboarding-client-select">
              <ClientSelectDropdown id="client-select-hdr" clients={clients} value={client.id} onChange={onSelectClient} fullWidth />
            </div>
            <h1>Onboarding History</h1>
          </div>
          <p className="sub">This client has been permanently offboarded. Onboarding cannot be resumed or restarted.</p>
        </div></div>
        <div role="status" className="onboarding-lock-notice">
          <strong>Onboarding permanently locked</strong>
          <div>All previous onboarding steps are preserved below for read-only review. Upload, save, complete, delete, and redo actions are unavailable.</div>
        </div>
        <div className="ladder onboarding-history-list">
          {steps.map((step) => (
            <div className={`rung onboarding-history-rung${step.done ? ' done' : ''}`} key={`${client.id}-${step.id}`}>
              <div className="mark">{step.done ? '✓' : '—'}</div>
              <div className="txt"><h3>{step.title}</h3><div className="meta">{step.done ? 'Completed before offboarding' : 'Not completed'} · Read only</div>{step.latestUpload?.original_filename && <div className="onboarding-file-name">Filed: <b>{step.latestUpload.original_filename}</b></div>}</div>
              <span className="tag bad">Locked</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  let currentPhase = null;

  // Use natural database step sequence
  const reorderedSteps = steps;

  return (
    <section className="view on" id="v-onboard">
      <div className="hdr-row">
        <div>
          <div className="eyebrow" id="ob-eyebrow">Selected Client</div>
          <div className="onboarding-workflow-heading">
            <ClientSelectDropdown
              id="client-select-hdr"
              clients={clients}
              value={client.id}
              onChange={(value) => onSelectClient(value)}
            />
            <h1 id="ob-title" style={{ margin: 0 }}>Onboarding Workflow</h1>
          </div>
        </div>
      </div>

      <div className="metrics onboarding-metrics">
        <div className="metric">
          <div className="v" id="m-complete">{doneCount} / {totalSteps}</div>
          <div className="l">Steps Complete</div>
          <div className="d" id="m-started">Started — <TimeDisplay value={client.created_at} easternOnly /></div>
        </div>
        <div className="metric">
          <div className="v" id="m-waiting">{activeStepNum}</div>
          <div className="l">Active Action</div>
          <div className="d" id="m-waiting-d">{activeStepTitle}</div>
        </div>
        <div className="metric">
          <div className="v" id="m-pct">{client.progress_pct}%</div>
          <div className="l">Completion</div>
          <div className="d" id="m-stage">Stage: {stageName}</div>
        </div>
        <div className="metric">
          <div className="v" id="m-move"><TimeDisplay value={client.updated_at} easternOnly /></div>
          <div className="l">Last Activity</div>
          <div className="d" id="m-move-d">Activity logged</div>
        </div>
      </div>

      <div className="ladder" id="ladder">
        {reorderedSteps.map((step) => {
          let renderPhaseHeader = false;
          let phaseText = step.phase;
          if (phaseText !== currentPhase) {
            currentPhase = phaseText;
            renderPhaseHeader = true;
          }

          return (
            <React.Fragment key={`${client.id}-${step.id}`}>
              {renderPhaseHeader && (
                <div className="phase">
                  {phaseText}
                </div>
              )}
              <StepRung
                step={step}
                clientId={client.id}
                roles={roles}
                onRefresh={onRefresh}
                onOpenNotes={onOpenNotes}
                onOpenRedo={onOpenRedo}
                onOpenAddRole={onOpenAddRole}
              />
            </React.Fragment>
          );
        })}
      </div>

      <div className="note onboarding-workflow-note">
        <b>Sequential Workflow:</b> Steps unlock one by one. Use the <b>💬 Notes</b> icon on any step to record internal notes. Steps can be completed via document uploads, structured forms, or integration callbacks.
      </div>

      <ConfirmModal
        isOpen={returnPrompt.isOpen}
        onClose={() => setReturnPrompt({ isOpen: false, pendingKey: '', stepName: '' })}
        onConfirm={handleConfirmPendingReturn}
        title="Submit Step"
        message={`Welcome back! If you finished work in the external tool for ${returnPrompt.stepName}, submit the step to continue.`}
        confirmText="Submit"
        cancelText="Not Yet"
      />

      <FeedbackModal
        isOpen={ladderFeedback.isOpen}
        onClose={() => setLadderFeedback({ ...ladderFeedback, isOpen: false })}
        kind={ladderFeedback.kind}
        title={ladderFeedback.title}
        content={ladderFeedback.content}
        checks={[]}
      />
    </section>
  );
}
