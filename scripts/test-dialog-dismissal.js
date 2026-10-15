import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) {
  globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const container = document.getElementById('root');
const root = createRoot(container);
const click = async element => {
  assert.ok(element, 'Expected a clickable element');
  await act(async () => {
    element.click();
    // The shared dialog queues the next dialog on a timer after resolving.
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};
const button = text => [...container.querySelectorAll('button')].find(item => item.textContent === text);
const fill = async (element, value) => {
  assert.ok(element);
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype :
      element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const outsideGestures = async (backdrop, card) => {
  assert.ok(backdrop);
  assert.ok(card);
  await act(async () => {
    // Moving away and dragging a text selection outside must not reset a form.
    for (const type of ['mouseout', 'mouseleave', 'pointerout', 'pointerleave']) {
      card.dispatchEvent(new window.MouseEvent(type, { bubbles: true, relatedTarget: backdrop }));
    }
    card.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    backdrop.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    backdrop.click();
    backdrop.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    backdrop.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    backdrop.dispatchEvent(new window.Event('touchstart', { bubbles: true }));
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
};
const load = async name => (await server.ssrLoadModule(
  '/src/onesmarter_admin/components/modals/' + name + '.jsx',
)).default;
let mountKey = 0;
let closeCount = 0;
const mountModal = async (Component, props = {}) => {
  closeCount = 0;
  function Harness() {
    const [isOpen, setOpen] = useState(true);
    return React.createElement(Component, { ...props, isOpen,
      onClose: () => { closeCount += 1; setOpen(false); },
    });
  }
  await act(async () => root.render(React.createElement(Harness, { key: ++mountKey })));
};
try {
  const CreateUser = await load('CreateUserModal');
  let saveCount = 0;
  let saved;
  let finishSave;
  await mountModal(CreateUser, {
    clients: [], currentUser: { is_superuser: true },
    onSave: async payload => {
      saveCount += 1;
      saved = payload;
      if (saveCount === 1) throw new Error('Account could not be created.');
      await new Promise(resolve => { finishSave = resolve; });
    },
  });
  await fill(container.querySelector('input[placeholder="e.g. John Doe"]'), 'Draft User');
  await outsideGestures(container.querySelector('.modal.on'), container.querySelector('.modal-card'));
  assert.equal(closeCount, 0);
  assert.equal(container.querySelector('input[placeholder="e.g. John Doe"]').value, 'Draft User');
  // Failed validation and failed requests must also retain the form.
  await act(async () => container.querySelector('form').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }),
  ));
  assert.equal(saveCount, 0);
  assert.equal(closeCount, 0);
  await fill(container.querySelector('input[type="email"]'), 'draft@example.test');
  await fill(container.querySelector('input[type="tel"]'), '2125550123');
  await fill(container.querySelector('input[type="password"]'), 'Test-only-password-123!');
  await fill([...container.querySelectorAll('select')].find(select =>
    [...select.options].some(option => option.value === 'Admin')), 'Admin');
  await click(button('Create Account'));
  assert.equal(saveCount, 1);
  assert.equal(closeCount, 0);
  assert.ok(container.textContent.includes('Account could not be created.'));
  assert.equal(container.querySelector('input[type="email"]').value, 'draft@example.test');
  await click(button('Create Account'));
  assert.equal(saveCount, 2);
  assert.equal(button('Creating...').disabled, true);
  await outsideGestures(container.querySelector('.modal.on'), container.querySelector('.modal-card'));
  assert.equal(closeCount, 0);
  await act(async () => finishSave());
  assert.equal(saved.name, 'Draft User');
  assert.equal(saved.mobile, '+12125550123');
  assert.equal(closeCount, 1);
  assert.equal(container.querySelector('.modal.on'), null);

  // Shared wrapper coverage for other forms affected by the same handler.
  for (const [name, props, selector] of [
    ['CreateUserModal', { clients: [] }, 'input'],
    ['EditUserModal', { clients: [], user: { id: 1, name: 'Existing User' } }, 'input'],
    ['AddClientModal', {}, 'input'],
    ['ResetPasswordModal', { user: { id: 1 } }, 'input'],
    ['AddRoleModal', {}, 'input'],
    ['NotesModal', {}, 'textarea'],
  ]) {
    await mountModal(await load(name), props);
    const input = container.querySelector(selector);
    await fill(input, 'Draft value');
    await outsideGestures(container.querySelector('.modal.on'), container.querySelector('.modal-card'));
    assert.equal(closeCount, 0, name + ' must remain open');
    assert.equal(input.value, 'Draft value', name + ' must retain its draft');
    await click(button(name === 'NotesModal' ? 'Close' : 'Cancel'));
    assert.equal(closeCount, 1, name + ' explicit close must work');
    assert.equal(container.querySelector('.modal.on'), null);
  }

  const { AppDialogProvider, showAppConfirm, showAppAlert } = await server.ssrLoadModule('/src/components/AppDialog.jsx');
  await act(async () => root.render(React.createElement(AppDialogProvider)));
  for (const [open, label, expected] of [[showAppConfirm, 'Cancel', false], [showAppAlert, 'OK', true]]) {
    let result;
    let pending;
    await act(async () => {
      pending = open('Test dialog');
      pending.then(value => { result = value; });
    });
    await outsideGestures(container.querySelector('.app-dialog-backdrop'), container.querySelector('.app-dialog'));
    assert.equal(result, undefined);
    await click(button(label));
    assert.equal(await pending, expected);
  }

  const { default: Topbar } = await server.ssrLoadModule('/src/components/Topbar.jsx');
  let loggedOut = false;
  await act(async () => root.render(React.createElement(Topbar, {
    clientUser: true, user: { name: 'Test User' }, onLogout: () => { loggedOut = true; },
  })));
  await click(container.querySelector('[aria-label="Sign Out"]'));
  await outsideGestures(container.querySelector('.logout-confirm-backdrop'), container.querySelector('.logout-confirm-dialog'));
  assert.ok(button('Cancel'));
  assert.equal(loggedOut, false);
  await click(button('Cancel'));
  assert.equal(container.querySelector('.logout-confirm-backdrop'), null);
  console.log('Dialog persistence: pointer/outside gestures, draft retention, validation, failure, saving, success and explicit cancel passed.');
} finally {
  await act(async () => root.unmount());
  await server.close();
  dom.window.close();
}
