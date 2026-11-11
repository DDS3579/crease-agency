import { $, $$ } from '../lib/dom';
import { copy } from '../content/demo/copy';

interface Field {
  name: string;
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  error: HTMLElement;
  validate: (v: string) => string;
}

export function initForm(): void {
  const form = $<HTMLFormElement>('[data-contact-form]');
  if (!form) return;
  const status = $('[data-form-status]', form);
  const submit = $<HTMLButtonElement>('[data-submit]', form);
  const fields: Field[] = [
    { name: 'name', el: $('#f-name', form)!, error: $('#f-name-error', form)!, validate: (v) => (v.trim() ? '' : copy.contact.validation.name) },
    { name: 'email', el: $('#f-email', form)!, error: $('#f-email-error', form)!, validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : copy.contact.validation.email) },
    { name: 'type', el: $('#f-type', form)!, error: $('#f-type-error', form)!, validate: (v) => (v ? '' : copy.contact.validation.type) },
    { name: 'message', el: $('#f-message', form)!, error: $('#f-message-error', form)!, validate: (v) => (v.trim() ? '' : copy.contact.validation.message) }
  ];

  const setError = (f: Field, msg: string): void => {
    f.error.textContent = msg;
    f.error.hidden = !msg;
    if (msg) f.el.setAttribute('aria-invalid', 'true');
    else f.el.removeAttribute('aria-invalid');
  };

  fields.forEach((f) => {
    f.el.addEventListener('blur', () => setError(f, f.validate(f.el.value)));
    f.el.addEventListener('input', () => {
      if (f.el.getAttribute('aria-invalid') === 'true') setError(f, f.validate(f.el.value));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let firstInvalid: Field | null = null;
    for (const f of fields) {
      const msg = f.validate(f.el.value);
      setError(f, msg);
      if (msg && !firstInvalid) firstInvalid = f;
    }
    if (firstInvalid) {
      firstInvalid.el.focus();
      return;
    }
    const hp = $<HTMLInputElement>('[name="company"]', form);
    if (hp && hp.value) {
      if (status) status.textContent = copy.contact.fields.success;
      form.reset();
      return;
    }
    if (submit) {
      submit.disabled = true;
      submit.textContent = copy.contact.fields.submitting;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    delete data.company;
    const endpoint = form.dataset.endpoint;
    const mailto = form.dataset.mailto;
    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('bad status');
        if (status) status.textContent = copy.contact.fields.success;
        form.reset();
      } else if (mailto) {
        const subject = encodeURIComponent(`Project inquiry: ${String(data.type ?? '')}`);
        const body = encodeURIComponent(
          `Name: ${String(data.name ?? '')}\nEmail: ${String(data.email ?? '')}\nType: ${String(data.type ?? '')}\n\n${String(data.message ?? '')}`
        );
        window.location.href = `mailto:${mailto}?subject=${subject}&body=${body}`;
        if (status) status.textContent = copy.contact.fields.success;
      } else {
        await new Promise((r) => setTimeout(r, 250));
        if (status) status.textContent = copy.contact.fields.demoSuccess;
        form.reset();
      }
    } catch {
      if (status) status.textContent = copy.contact.fields.error;
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = copy.contact.fields.submit;
      }
    }
  });
}
