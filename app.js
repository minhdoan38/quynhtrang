import {
  PRODUCTS,
  createInitialState,
  transitionState,
  getDesignSummary,
  getPreflight,
} from './product-state.js';

const STATE_KEY = 'print-customizer-state-v1';
const ORDER_KEY = 'print-customizer-order-v1';
const app = document.getElementById('app');
const editorView = document.getElementById('editor-view');
const previewView = document.getElementById('preview-view');
const checkoutView = document.getElementById('checkout-view');
const sheet = document.getElementById('sheet');
const toast = document.getElementById('toast');

let state = restoreState();
let view = 'editor';
let pendingOrder = restoreOrder();
const objectUrls = new Set();
if (typeof state.image?.src === 'string' && state.image.src.startsWith('blob:')) {
  objectUrls.add(state.image.src);
}
let uploadSequence = 0;
let past = [];
let future = [];
let toastTimer;
let lastRenderedProductId = null;
let lastFocusedElementBeforeSheet = null;

function restoreState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return createInitialState();
    const saved = JSON.parse(raw);
    const base = createInitialState(saved?.productId);
    const product = PRODUCTS[saved?.productId] ? saved.productId : base.productId;
    const productBase = createInitialState(product);
    return {
      ...productBase,
      ...saved,
      productId: product,
      productOptions: { ...productBase.productOptions, ...(saved.productOptions || {}) },
      quantity: Number.isFinite(Number(saved.quantity)) ? Math.min(999, Math.max(1, Math.trunc(Number(saved.quantity)))) : 1,
    };
  } catch {
    return createInitialState();
  }
}

function collectReferencedUrls() {
  const referenced = new Set();
  const checkSrc = (item) => {
    const src = item?.image?.src;
    if (typeof src === 'string' && src.startsWith('blob:')) {
      referenced.add(src);
    }
  };
  checkSrc(state);
  past.forEach(checkSrc);
  future.forEach(checkSrc);
  if (pendingOrder?.design) {
    checkSrc(pendingOrder.design);
  }
  return referenced;
}

function pruneObjectUrls() {
  if (!globalThis.URL?.revokeObjectURL) return;
  const referenced = collectReferencedUrls();
  for (const url of objectUrls) {
    if (!referenced.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      objectUrls.delete(url);
    }
  }
}
  } catch {
    return createInitialState();
  }
}

function restoreOrder() {
  try {
    const saved = sessionStorage.getItem(ORDER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    if (pendingOrder) sessionStorage.setItem(ORDER_KEY, JSON.stringify(pendingOrder));
    else sessionStorage.removeItem(ORDER_KEY);
  } catch {
    showToast('Không thể lưu thiết kế trong phiên này.');
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function formatPrice(value) {
  return `${new Intl.NumberFormat('vi-VN').format(value)}\u00a0₫`;
}

function product() {
  return PRODUCTS[state.productId] || PRODUCTS.wrapping;
}

function update(action) {
  const next = transitionState(state, action);
  if (next === state) return;
  past.push(state);
  future = [];
  state = next;
  pruneObjectUrls();
  persist();
  render();
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

function setView(nextView) {
  view = nextView;
  render();
}

function render() {
  if (editorView) editorView.hidden = view !== 'editor';
  if (previewView) previewView.hidden = view !== 'preview';
  if (checkoutView) checkoutView.hidden = view !== 'checkout';
  renderEditor();
  renderPreview();
  renderCheckout();
}

function renderEditor() {
  const choices = document.getElementById('product-choices');
  if (choices) {
    choices.innerHTML = Object.values(PRODUCTS).map((item) => {
      const lowest = Math.min(...item.variants.map((variant) => variant.price));
      const selected = item.id === state.productId;
      return `<div role="listitem"><button type="button" class="choice-card${selected ? ' is-selected' : ''}" data-action="select-product" data-value="${item.id}" aria-pressed="${selected}"><span class="choice-card__title">${escapeHtml(item.name)}</span><span class="choice-card__meta">Từ ${formatPrice(lowest)}</span></button></div>`;
    }).join('');
  }

  const variants = document.getElementById('variant-choices');
  if (variants) {
    variants.innerHTML = product().variants.map((variant) => `<label><input type="radio" name="variant" value="${variant.id}" data-action="select-variant"${variant.id === state.variantId ? ' checked' : ''}><span>${escapeHtml(variant.name)}</span></label>`).join('');
  }

  document.querySelectorAll('[data-action="select-template"]').forEach((button) => {
    const selected = button.dataset.value === state.templateId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  const text = document.getElementById('design-text');
  if (text && text.value !== state.text) text.value = state.text;
  const color = document.getElementById('text-color');
  if (color && color.value !== state.color) color.value = state.color;
  const background = document.getElementById('background-color');
  if (background && background.value !== state.backgroundColor) background.value = state.backgroundColor;
  renderProductControls();
  renderCanvas();
}

function optionRadio(name, key, value, label) {
  return `<label><input type="radio" name="${name}" value="${value}" data-action="set-product-option" data-option="${key}"${state.productOptions[key] === value ? ' checked' : ''}><span>${label}</span></label>`;
}

function renderProductControls() {
  const controls = document.getElementById('product-controls');
  if (!controls) return;
  const options = state.productOptions;

  if (lastRenderedProductId === state.productId) {
    // Update existing controls in place to preserve continuous range/input interaction
    controls.querySelectorAll('input[data-action="set-product-option"]').forEach((input) => {
      const key = input.dataset.option;
      if (!key || !(key in options)) return;
      if (input.type === 'checkbox') {
        input.checked = Boolean(options[key]);
      } else if (input.type === 'radio') {
        input.checked = input.value === options[key];
      } else if (input.type === 'range') {
        if (input.value !== String(options[key])) {
          input.value = options[key];
        }
        const output = controls.querySelector(`output[for="${input.id}"]`);
        if (output) output.textContent = String(options[key]);
      }
    });
    return;
  }

  lastRenderedProductId = state.productId;
  let content = '';
  if (state.productId === 'wrapping') {
    content = `<fieldset class="field-group"><legend>Lặp họa tiết</legend>${optionRadio('repeat-mode', 'mode', 'repeat', 'Lặp đều')}${optionRadio('repeat-mode', 'mode', 'single', 'Một lần')}</fieldset><fieldset class="field-group"><legend>Cách sắp xếp</legend>${optionRadio('repeat-style', 'repeatStyle', 'regular', 'Đều')}${optionRadio('repeat-style', 'repeatStyle', 'scattered', 'Tự nhiên')}${optionRadio('repeat-style', 'repeatStyle', 'brick', 'Xếp lệch')}</fieldset><label class="field-group" for="pattern-scale">Kích thước họa tiết: <output for="pattern-scale">${Number(options.patternScale) || 100}</output>%<input id="pattern-scale" type="range" min="50" max="200" value="${Number(options.patternScale) || 100}" data-action="set-product-option" data-option="patternScale"></label>`;
  } else if (state.productId === 'card') {
    content = `<fieldset class="field-group"><legend>Mặt đang chỉnh</legend>${optionRadio('card-surface', 'surface', 'front', 'Mặt trước')}${optionRadio('card-surface', 'surface', 'inside', 'Mặt trong')}</fieldset><fieldset class="field-group"><legend>Cách gấp</legend>${optionRadio('card-fold', 'fold', 'half', 'Gấp đôi')}${optionRadio('card-fold', 'fold', 'flat', 'Tờ phẳng')}</fieldset>`;
  } else if (state.productId === 'sticker') {
    content = `<fieldset class="field-group"><legend>Viền sticker</legend><label><input type="checkbox" data-action="set-product-option" data-option="hasWhiteBorder"${options.hasWhiteBorder ? ' checked' : ''}><span>Có viền trắng</span></label><label class="field-group" for="border-width">Độ dày viền: <output for="border-width">${Number(options.borderWidth) || 0}</output>px<input id="border-width" type="range" min="0" max="20" value="${Number(options.borderWidth) || 0}" data-action="set-product-option" data-option="borderWidth"></label></fieldset>`;
  } else {
    content = `<fieldset class="field-group"><legend>Bề mặt bìa</legend>${optionRadio('notebook-finish', 'finish', 'matte', 'Mờ')}${optionRadio('notebook-finish', 'finish', 'glossy', 'Bóng')}</fieldset>`;
  }
  controls.innerHTML = content;
}

function computeVisualStyles() {
  const opts = state.productOptions;
  const styles = [];
  const classes = [`design-canvas--${state.productId}`];

  if (state.productId === 'wrapping') {
    const scale = Number(opts.patternScale) || 100;
    const size = Math.round((68 * scale) / 100);
    styles.push(`--pattern-size: ${size}px`);
    if (opts.mode === 'repeat') classes.push('is-mode-repeat');
  } else if (state.productId === 'card') {
    if (opts.surface === 'inside') classes.push('is-surface-inside');
  } else if (state.productId === 'sticker') {
    const border = opts.hasWhiteBorder ? (Number(opts.borderWidth) || 4) : 0;
    styles.push(`--sticker-border-width: ${border}px`);
  } else if (state.productId === 'notebook') {
    if (opts.finish === 'glossy') classes.push('is-finish-glossy');
    else classes.push('is-finish-matte');
  }

  return {
    inlineStyle: styles.join('; '),
    classNames: classes.join(' '),
  };
}

function renderCanvas() {
  const canvas = document.getElementById('design-canvas');
  if (!canvas) return;
  const visuals = computeVisualStyles();
  const classes = `design-canvas ${visuals.classNames}`;
  const image = state.image?.src ? `<img class="design-image" src="${escapeAttr(state.image.src)}" alt="Ảnh đã tải lên">` : '';
  const text = state.text ? `<p class="design-text" style="color:${escapeAttr(state.color)}">${escapeHtml(state.text)}</p>` : '';
  canvas.className = classes;
  canvas.style.backgroundColor = state.backgroundColor;
  if (visuals.inlineStyle) {
    canvas.style.cssText = `background-color: ${state.backgroundColor}; ${visuals.inlineStyle};`;
  } else {
    canvas.style.cssText = `background-color: ${state.backgroundColor};`;
  }
  canvas.innerHTML = image + text + (!image && !text ? '<p id="canvas-empty-state">Thêm nội dung để bắt đầu</p>' : '');
}



function summaryMarkup(summary) {
  return `<dl class="summary-list"><div><dt>Sản phẩm</dt><dd>${escapeHtml(summary.product)}</dd></div><div><dt>Khổ</dt><dd>${escapeHtml(summary.variant)}</dd></div><div><dt>Số lượng</dt><dd>${summary.quantity}</dd></div><div><dt>Tạm tính</dt><dd><strong>${escapeHtml(summary.priceLabel)}</strong></dd></div></dl>`;
}

function mockupMarkup() {
  const visuals = computeVisualStyles();
  const image = state.image?.src ? `<img class="design-image" src="${escapeAttr(state.image.src)}" alt="Ảnh thiết kế">` : '';
  const text = state.text ? `<p class="design-text" style="color:${escapeAttr(state.color)}">${escapeHtml(state.text)}</p>` : '<p class="preview-empty">Chưa có chữ</p>';
  const styleAttr = `background-color:${escapeAttr(state.backgroundColor)}; ${visuals.inlineStyle}`;
  return `<div class="mockup mockup--${state.productId} ${visuals.classNames}" style="${styleAttr}">${image}${text}</div><p class="preview-caption">${escapeHtml(product().name)} · ${escapeHtml(product().variants.find((item) => item.id === state.variantId)?.name || '')}</p>`;
}

function renderPreview() {
  const preview = document.getElementById('preview-product');
  if (preview) preview.innerHTML = mockupMarkup();
  const summary = document.getElementById('preview-summary');
  if (summary) summary.innerHTML = summaryMarkup(getDesignSummary(state));
  const checks = document.getElementById('preflight-checks');
  if (checks) {
    const preflight = getPreflight(state);
    checks.dataset.level = preflight.level;
    checks.innerHTML = preflight.checks.map((check) => `<p class="check check--${check.level}"><span aria-hidden="true">${check.level === 'pass' ? '✓' : '!'}</span>${escapeHtml(check.label)}</p>`).join('');
  }
}

function ensureAddressField(form) {
  if (!form || document.getElementById('customer-address')) return;
  const field = document.createElement('div');
  field.className = 'field-group';
  field.innerHTML = '<label for="customer-address">Địa chỉ nhận hàng</label><textarea id="customer-address" name="address" rows="2" autocomplete="street-address" required></textarea>';
  const note = document.getElementById('customer-note');
  if (note?.parentElement) note.parentElement.before(field);
  else if (form.append) form.append(field);
}

function renderCheckout() {
  const summary = document.getElementById('order-summary');
  if (summary) summary.innerHTML = summaryMarkup(getDesignSummary(state));
  const quantity = document.getElementById('quantity');
  if (quantity && quantity.value !== String(state.quantity)) quantity.value = String(state.quantity);
  ensureAddressField(document.getElementById('customer-order-form'));
  const confirmation = document.getElementById('confirmation');
  if (confirmation) confirmation.hidden = !pendingOrder;
  const qr = document.getElementById('qr-demo');
  if (qr && pendingOrder) qr.setAttribute('aria-label', 'Mã QR minh họa, trạng thái thanh toán: unverified');
}

function openSheet(title, content, openerElement = null) {
  if (!sheet) return;
  lastFocusedElementBeforeSheet = openerElement || document.activeElement;
  const heading = document.getElementById('sheet-title');
  const body = document.getElementById('sheet-content');
  if (heading) heading.textContent = title;
  if (body) body.innerHTML = content;
  sheet.hidden = false;
  const closeBtn = sheet.querySelector('[data-action="close-sheet"]');
  if (closeBtn && typeof closeBtn.focus === 'function') {
    closeBtn.focus();
  }
}

function closeSheet() {
  if (!sheet || sheet.hidden) return;
  sheet.hidden = true;
  if (lastFocusedElementBeforeSheet && typeof lastFocusedElementBeforeSheet.focus === 'function') {
    lastFocusedElementBeforeSheet.focus();
  }
  lastFocusedElementBeforeSheet = null;
}

function readUpload(file) {
  if (!file) return;
  const sequence = ++uploadSequence;
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showToast('Ảnh không hỗ trợ. Hãy chọn PNG, JPG hoặc WebP.');
    return;
  }
  if (!file.size) {
    showToast('Không đọc được ảnh. Hãy chọn tệp khác.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => {
    if (sequence === uploadSequence) showToast('Không đọc được ảnh. Hãy thử lại.');
  };
  reader.onload = () => {
    if (sequence !== uploadSequence) return;
    const dataUrl = String(reader.result || '');
    let candidateUrl = null;
    let src = dataUrl;
    try {
      if (globalThis.URL?.createObjectURL) {
        candidateUrl = URL.createObjectURL(file);
        objectUrls.add(candidateUrl);
        src = candidateUrl;
      }
    } catch {
      candidateUrl = null;
    }
    const revokeCandidate = () => {
      if (candidateUrl) {
        objectUrls.delete(candidateUrl);
        if (globalThis.URL?.revokeObjectURL) URL.revokeObjectURL(candidateUrl);
      }
    };
    const image = new Image();
    image.onload = () => {
      if (sequence !== uploadSequence) {
        revokeCandidate();
        return;
      }
      update({ type: 'SET_IMAGE', value: { name: file.name, type: file.type, size: file.size, src, width: image.naturalWidth || image.naturalHeight || 0, height: image.naturalHeight || image.height || 0 } });
      pruneObjectUrls();
    };
    image.onerror = () => {
      revokeCandidate();
      if (sequence === uploadSequence) showToast('Không mở được ảnh. Hãy chọn tệp khác.');
    };
    image.src = src;
  };
  reader.readAsDataURL(file);
}

function valueForControl(control) {
  if (control.type === 'checkbox') return control.checked;
  if (control.type === 'range' || control.dataset.option === 'patternScale' || control.dataset.option === 'borderWidth') return Number(control.value);
  return control.value;
}

function actionFromControl(control) {
  const action = control.dataset.action;
  if (action === 'set-product-option') return { type: 'SET_PRODUCT_OPTION', key: control.dataset.option, value: valueForControl(control) };
  if (action === 'set-text') return { type: 'SET_TEXT', value: control.value };
  if (action === 'set-color') return { type: 'SET_COLOR', value: control.value };
  if (action === 'set-background-color') return { type: 'SET_BACKGROUND_COLOR', value: control.value };
  if (action === 'set-quantity') return { type: 'SET_QUANTITY', value: control.value };
  if (action === 'select-variant') return { type: 'SET_VARIANT', value: control.value };
  return null;
}

function closestAction(event) {
  const target = event.target;
  return target?.closest ? target.closest('[data-action]') : (target?.dataset?.action ? target : null);
}

function handlesInputEvent(control) {
  return ['set-text', 'set-color', 'set-background-color', 'set-quantity'].includes(control.dataset.action)
    || control.type === 'range';
}

function handleInput(event) {
  const control = closestAction(event);
  const action = control && handlesInputEvent(control) && actionFromControl(control);
  if (action) update(action);
}

function handleChange(event) {
  const control = closestAction(event);
  if (!control) return;
  if (control.dataset.action === 'upload-image') {
    readUpload(control.files?.[0]);
    control.value = '';
    return;
  }
  if (handlesInputEvent(control)) return;
  const action = actionFromControl(control);
  if (action) update(action);
}

function handleClick(event) {
  const control = closestAction(event);
  if (!control) return;
  const action = control.dataset.action;
  if (action === 'select-product') update({ type: 'SET_PRODUCT', value: control.dataset.value });
  else if (action === 'select-template') update({ type: 'SET_TEMPLATE', value: control.dataset.value });
  else if (action === 'add-text') {
    if (!state.text) update({ type: 'SET_TEXT', value: 'Chúc mừng bạn!' });
    else showToast('Bạn có thể sửa dòng chữ ở bảng tùy chỉnh.');
  } else if (action === 'change-background') {
    document.getElementById('background-color')?.click();
  } else if (action === 'open-preview') setView('preview');
  else if (action === 'close-preview' || action === 'back-to-editor') setView('editor');
  else if (action === 'open-checkout') setView(view === 'preview' && previewView?.contains(control) ? 'checkout' : 'preview');
  else if (action === 'increase-quantity') update({ type: 'SET_QUANTITY', value: Math.min(999, state.quantity + 1) });
  else if (action === 'decrease-quantity') update({ type: 'SET_QUANTITY', value: Math.max(1, state.quantity - 1) });
  else if (action === 'reset-design') {
    uploadSequence += 1;
    update({ type: 'SET_TEXT', value: '' });
    update({ type: 'SET_IMAGE', value: null });
    pruneObjectUrls();
  } else if (action === 'start-over') {
    uploadSequence += 1;
    state = createInitialState();
    pendingOrder = null;
    past = [];
    future = [];
    pruneObjectUrls();
    persist();
    setView('editor');
  } else if (action === 'close-sheet') {
    closeSheet();
  } else if (action === 'open-templates') {
    openSheet('Chọn mẫu', 'Chọn mẫu ngay ở phần “Bắt đầu từ đâu”.', control);
  } else if (action === 'open-layers') {
    openSheet('Lớp thiết kế', state.image || state.text ? 'Thiết kế gồm nền, ảnh và chữ.' : 'Chưa có lớp nội dung nào.', control);
  } else if (action === 'add-content') {
    document.getElementById('design-text')?.focus();
    showToast('Thêm chữ hoặc ảnh cho thiết kế.');
  } else if (action === 'undo' && past.length) {
    future.unshift(state);
    state = past.pop();
    pruneObjectUrls();
    persist();
    render();
  } else if (action === 'redo' && future.length) {
    past.push(state);
    state = future.shift();
    pruneObjectUrls();
    persist();
    render();
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (form?.dataset?.action !== 'submit-order') return;
  event.preventDefault();
  const name = document.getElementById('customer-name')?.value.trim() || '';
  const email = document.getElementById('customer-email')?.value.trim() || '';
  const phone = document.getElementById('customer-phone')?.value.trim() || '';
  const address = document.getElementById('customer-address')?.value.trim() || '';
  const note = document.getElementById('customer-note')?.value.trim() || '';
  const qty = Number.parseInt(state.quantity, 10);
  if (!Number.isFinite(qty) || qty < 1 || qty > 999) {
    showToast('Số lượng đặt hàng không hợp lệ (1-999).');
    return;
  }
  if (!name || !phone || !address) {
    showToast('Vui lòng điền họ tên, số điện thoại và địa chỉ.');
    return;
  }
  pendingOrder = {
    id: `demo-${Date.now()}`,
    status: 'pending',
    paymentStatus: 'unverified',
    customer: { name, email, phone, address, note },
    design: JSON.parse(JSON.stringify(state)),
    summary: getDesignSummary(state),
    createdAt: new Date().toISOString(),
  };
  persist();
  setView('checkout');
  showToast('Đã tạo đơn demo. Thanh toán chưa được xác nhận.');
}

if (sheet) {
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('[data-action="close-sheet"]')) {
      closeSheet();
    }
  });
  sheet.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hidden && el.offsetParent !== null);
      if (!focusables.length) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sheet && !sheet.hidden) {
    closeSheet();
  }
});

if (app) {
  app.addEventListener('click', handleClick);
  app.addEventListener('input', handleInput);
  app.addEventListener('change', handleChange);
  app.addEventListener('submit', handleSubmit);
  render();
}

export { state, render, update };
