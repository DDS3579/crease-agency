import { $ } from '../lib/dom';
import { copy } from '../content/demo/copy';

interface Field {
  name: string;
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  error: HTMLElement;
  validate: (v: string) => string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initForm(): void {
  const form = $<HTMLFormElement>('[data-contact-form]');
  if (!form) return;
  const status = $('[data-form-status]', form);
  const submit = $<HTMLButtonElement>('[data-submit]', form);

  const name = $<HTMLInputElement>('#f-name', form);
  const email = $<HTMLInputElement>('#f-email', form);
  const type = $<HTMLSelectElement>('#f-type', form);
  const message = $<HTMLTextAreaElement>('#f-message', form);
  const nameError = $<HTMLElement>('#f-name-error', form);
  const emailError = $<HTMLElement>('#f-email-error', form);
  const typeError = $<HTMLElement>('#f-type-error', form);
  const messageError = $<HTMLElement>('#f-message-error', form);
  if (!name || !email || !type || !message || !nameError || !emailError || !typeError || !messageError) {
    return;
  }

  const fields: Field[] = [
    { name: 'name', el: name, error: nameError, validate: (v) => (v.trim() ? '' : copy.contact.validation.name) },
    { name: 'email', el: email, error: emailError, validate: (v) => (EMAIL_RE.test(v.trim()) ? '' : copy.contact.validation.email) },
    { name: 'type', el: type, error: typeError, validate: (v) => (v ? '' : copy.contact.validation.type) },
    { name: 'message', el: message, error: messageError, validate: (v) => (v.trim() ? '' : copy.contact.validation.message) }
  ];

  const setError = (f: Field, msg: string): void => {
    f.error.textContent = msg;
    f.error.hidden = !msg;
    if (msg) f.el.setAttribute('aria-invalid', 'true');
    else f.el.removeAttribute('aria-invalid');
  };

  const clearErrors = (): void => fields.forEach((f) => setError(f, ''));

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

    // Honeypot: accept silently, send nothing.
    const hp = $<HTMLInputElement>('[name="company"]', form);
    if (hp && hp.value) {
      if (status) status.textContent = copy.contact.fields.success;
      form.reset();
      clearErrors();
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = copy.contact.fields.submitting;
    }
    form.setAttribute('aria-busy', 'true');

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
        clearErrors();
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
        clearErrors();
      }
    } catch {
      if (status) status.textContent = copy.contact.fields.error;
    } finally {
      form.removeAttribute('aria-busy');
      if (submit) {
        submit.disabled = false;
        submit.textContent = copy.contact.fields.submit;
      }
    }
  });
}
