import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'localStorage']) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const change = async (element, value) => act(async () => {
  const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const field = label => [...document.querySelectorAll('.field')].find(item => item.querySelector('label')?.textContent === label)?.querySelector('select');
const submit = () => act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
try {
  const { default: Create } = await server.ssrLoadModule('/src/onesmarter_admin/components/modals/CreateUserModal.jsx');
  const { default: Edit } = await server.ssrLoadModule('/src/onesmarter_admin/components/modals/EditUserModal.jsx');
  const clients = [{ id: 'client-a', name: 'Client A' }, { id: 'client-b', name: 'Client B' }];
  const currentUsers = [{ role: 'Admin', is_staff: true }, { role: 'Super Admin', is_staff: true, is_superuser: true }];
  for (const currentUser of currentUsers) {
    const saves = [];
    const props = { isOpen: true, currentUser, clients, onClose: () => {}, onSave: (...args) => saves.push(args) };
    await act(async () => root.render(React.createElement(Create, { ...props, key: currentUser.role })));
    assert.ok(field('Role').querySelector('option[value="Demo"]'));
    assert.equal(!!field('Role').querySelector('option[value="Super Admin"]'), !!currentUser.is_superuser);
    await change(field('Role'), 'Demo');
    assert.ok(field('Client *'), 'Demo creation requires an assigned client');
    await change(document.querySelector('input[placeholder="e.g. John Doe"]'), 'Demo account');
    await change(document.querySelector('input[type="email"]'), 'demo@example.test');
    await change(document.querySelector('input[type="password"]'), 'TestPassword!123');
    await change(document.querySelector('input[type="tel"]'), '4155550100');
    await submit();
    assert.equal(saves.length, 0, 'A Demo cannot be created without a client');
    await change(field('Client *'), 'client-a');
    await submit();
    assert.equal(saves.length, 1);
    assert.equal(saves[0][0].role, 'Demo');
    assert.equal(saves[0][0].client_id, 'client-a');

    const user = { id: 42, person: 'Demo account', email: 'demo@example.test', mobile: '+14155550100',
      role: 'Demo', client_id: 'client-a' };
    await act(async () => root.render(React.createElement(Edit, { ...props, user })));
    assert.equal(field('Role').value, 'Demo');
    assert.equal(field('Client *').value, 'client-a');
    await change(field('Client *'), 'client-b');
    await submit();
    assert.equal(saves.length, 2);
    assert.equal(saves[1][0], 42);
    assert.equal(saves[1][1].client_id, 'client-b');
    assert.equal(saves[1][1].role, 'Demo');
    assert.equal(saves[1][1].is_staff, false);
    assert.equal(saves[1][1].is_superuser, false);
  }
  console.log('Admin and Super Admin Demo creation, required client selection, and Edit Account client reassignment passed.');
} finally {
  await act(async () => root.unmount());
  await server.close(); dom.window.close();
}
