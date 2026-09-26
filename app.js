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
let uploadUrl = state.image?.src?.startsWith('blob:') ? state.image.src : null;
let past = [];
let future = [];
let toastTimer;

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
      quantity: Number.isFinite(Number(saved.quantity)) && Number(saved.quantity) > 0 ? Number(saved.quantity) : 1,
    };
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
  let content = '';
  if (state.productId === 'wrapping') {
    content = `<fieldset class="field-group"><legend>Lặp họa tiết</legend>${optionRadio('repeat-mode', 'mode', 'repeat', 'Lặp đều')}${optionRadio('repeat-mode', 'mode', 'single', 'Một lần')}</fieldset><fieldset class="field-group"><legend>Cách sắp xếp</legend>${optionRadio('repeat-style', 'repeatStyle', 'regular', 'Đều')}${optionRadio('repeat-style', 'repeatStyle', 'scattered', 'Tự nhiên')}${optionRadio('repeat-style', 'repeatStyle', 'brick', 'Xếp lệch')}</fieldset><label class="field-group" for="pattern-scale">Kích thước họa tiết<input id="pattern-scale" type="range" min="50" max="200" value="${Number(options.patternScale) || 100}" data-action="set-product-option" data-option="patternScale"></label>`;
  } else if (state.productId === 'card') {
    content = `<fieldset class="field-group"><legend>Mặt đang chỉnh</legend>${optionRadio('card-surface', 'surface', 'front', 'Mặt trước')}${optionRadio('card-surface', 'surface', 'inside', 'Mặt trong')}</fieldset><fieldset class="field-group"><legend>Cách gấp</legend>${optionRadio('card-fold', 'fold', 'half', 'Gấp đôi')}${optionRadio('card-fold', 'fold', 'flat', 'Tờ phẳng')}</fieldset>`;
  } else if (state.productId === 'sticker') {
    content = `<fieldset class="field-group"><legend>Viền sticker</legend><label><input type="checkbox" data-action="set-product-option" data-option="hasWhiteBorder"${options.hasWhiteBorder ? ' checked' : ''}><span>Có viền trắng</span></label><label class="field-group" for="border-width">Độ dày viền<input id="border-width" type="range" min="0" max="20" value="${Number(options.borderWidth) || 0}" data-action="set-product-option" data-option="borderWidth"></label></fieldset>`;
  } else {
    content = `<fieldset class="field-group"><legend>Bề mặt bìa</legend>${optionRadio('notebook-finish', 'finish', 'matte', 'Mờ')}${optionRadio('notebook-finish', 'finish', 'glossy', 'Bóng')}</fieldset>`;
  }
  controls.innerHTML = content;
}

function renderCanvas() {
  const canvas = document.getElementById('design-canvas');
  if (!canvas) return;
  const classes = `design-canvas design-canvas--${state.productId}`;
  const image = state.image?.src ? `<img class="design-image" src="${escapeAttr(state.image.src)}" alt="Ảnh đã tải lên">` : '';
  const text = state.text ? `<p class="design-text" style="color:${escapeAttr(state.color)}">${escapeHtml(state.text)}</p>` : '';
  canvas.className = classes;
  canvas.style.backgroundColor = state.backgroundColor;
  canvas.innerHTML = image + text + (!image && !text ? '<p id="canvas-empty-state">Thêm nội dung để bắt đầu</p>' : '');
}

function summaryMarkup(summary) {
  return `<dl class="summary-list"><div><dt>Sản phẩm</dt><dd>${escapeHtml(summary.product)}</dd></div><div><dt>Khổ</dt><dd>${escapeHtml(summary.variant)}</dd></div><div><dt>Số lượng</dt><dd>${summary.quantity}</dd></div><div><dt>Tạm tính</dt><dd><strong>${escapeHtml(summary.priceLabel)}</strong></dd></div></dl>`;
}

function mockupMarkup() {
  const image = state.image?.src ? `<img class="design-image" src="${escapeAttr(state.image.src)}" alt="Ảnh thiết kế">` : '';
  const text = state.text ? `<p class="design-text" style="color:${escapeAttr(state.color)}">${escapeHtml(state.text)}</p>` : '<p class="preview-empty">Chưa có chữ</p>';
  return `<div class="mockup mockup--${state.productId}" style="background-color:${escapeAttr(state.backgroundColor)}">${image}${text}</div><p class="preview-caption">${escapeHtml(product().name)} · ${escapeHtml(product().variants.find((item) => item.id === state.variantId)?.name || '')}</p>`;
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

function openSheet(title, content) {
  if (!sheet) return;
  const heading = document.getElementById('sheet-title');
  const body = document.getElementById('sheet-content');
  if (heading) heading.textContent = title;
  if (body) body.innerHTML = content;
  sheet.hidden = false;
}

function readUpload(file) {
  if (!file) return;
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
  reader.onerror = () => showToast('Không đọc được ảnh. Hãy thử lại.');
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    let src = dataUrl;
    try {
      if (globalThis.URL?.createObjectURL) {
        if (uploadUrl && globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL(uploadUrl);
        uploadUrl = URL.createObjectURL(file);
        src = uploadUrl;
      }
    } catch {
      uploadUrl = null;
    }
    const image = new Image();
    image.onload = () => update({ type: 'SET_IMAGE', value: { name: file.name, type: file.type, size: file.size, src, width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 } });
    image.onerror = () => showToast('Không mở được ảnh. Hãy chọn tệp khác.');
    image.src = dataUrl;
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

function handleInput(event) {
  const control = closestAction(event);
  const action = control && actionFromControl(control);
  if (action && ['set-text', 'set-color', 'set-background-color', 'set-quantity', 'set-product-option'].includes(control.dataset.action)) update(action);
}

function handleChange(event) {
  const control = closestAction(event);
  if (!control) return;
  if (control.dataset.action === 'upload-image') {
    readUpload(control.files?.[0]);
    control.value = '';
    return;
  }
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
  else if (action === 'open-checkout') setView('checkout');
  else if (action === 'increase-quantity') update({ type: 'SET_QUANTITY', value: Math.min(999, state.quantity + 1) });
  else if (action === 'decrease-quantity') update({ type: 'SET_QUANTITY', value: Math.max(1, state.quantity - 1) });
  else if (action === 'reset-design') {
    if (uploadUrl && globalThis.URL?.revokeObjectURL) globalThis.URL.revokeObjectURL(uploadUrl);
    uploadUrl = null;
    update({ type: 'SET_TEXT', value: '' });
    update({ type: 'SET_IMAGE', value: null });
  } else if (action === 'start-over') {
    state = createInitialState();
    pendingOrder = null;
    past = [];
    future = [];
    persist();
    setView('editor');
  } else if (action === 'close-sheet') {
    if (sheet) sheet.hidden = true;
  } else if (action === 'open-templates') {
    openSheet('Chọn mẫu', 'Chọn mẫu ngay ở phần “Bắt đầu từ đâu”.');
  } else if (action === 'open-layers') {
    openSheet('Lớp thiết kế', state.image || state.text ? 'Thiết kế gồm nền, ảnh và chữ.' : 'Chưa có lớp nội dung nào.');
  } else if (action === 'add-content') {
    document.getElementById('design-text')?.focus();
    showToast('Thêm chữ hoặc ảnh cho thiết kế.');
  } else if (action === 'undo' && past.length) {
    future.unshift(state);
    state = past.pop();
    persist();
    render();
  } else if (action === 'redo' && future.length) {
    past.push(state);
    state = future.shift();
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

if (app) {
  app.addEventListener('click', handleClick);
  app.addEventListener('input', handleInput);
  app.addEventListener('change', handleChange);
  app.addEventListener('submit', handleSubmit);
  render();
}

export { state, render, update };
