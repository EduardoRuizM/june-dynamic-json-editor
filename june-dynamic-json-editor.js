// JuNe Dynamic JSON Editor
// https://github.com/EduardoRuizM/june-dynamic-json-editor (2.1.1) - Copyright (c) 2026 Eduardo Ruiz <eruiz@dataclick.es>

class JuNeDynamicJSONEditor {
  constructor(schema, container, prefix = 'data') {
    document.getElementById(container).innerHTML = `<div><div id='${container}' style="display: inline-block"><div style="padding: 4px; background: #333; border-radius: 4px">` +
	`<button id="${container}_btnExpand" title="Expand all" class="jstree-button" style="padding: 2px 4px">⯆</button> ` +
	`<button id="${container}_btnCollapse" title="Collapse all" class="jstree-button" style="padding: 2px 5px">⯈</button></div><div id='edit_${container}'></div></div></div>`;
    this.schema = schema;
    this.container = this.el(`edit_${container}`);
    this.prefix = prefix;
    this.el(`${container}_btnExpand`).addEventListener('click', () => this.details(true));
    this.el(`${container}_btnCollapse`).addEventListener('click', () => this.details(false));
  }

  el(id) {
    return document.getElementById(id);
  }

  // --- INPUT GENERATOR ---
  makeInput(field, id, value = null, container = null) {
    let el, attrs = `id="${id}"`;
    if (field.attrs) {
      for(const a in field.attrs) {
	if (field.attrs[a] !== null) attrs += ` ${a}="${field.attrs[a]}"`;
      }
    }
    if (!['fixed', 'bool', 'enum'].includes(field.type)) attrs += ' style="display: block"';

    if (field.type === 'enum') {
      el = `<select ${attrs} data-dyjsed-dep="1">`;
      field.values.forEach(v => el += `<option value="${v}"${(v === value) ? ' selected' : ''}>${v}</option>`);
      el += '</select>';
    }

    if (field.type === 'fixed') el = `<span><b>${field.value}</b></span><input type="hidden" ${attrs} value="${field.value || ''}">`;
    if (field.type === 'bool') el = `<div><input ${attrs} type="checkbox" ${(value) ? ' checked' : ''}><label for="${id}">${field.text}</label></div>`;

    if (!el) {
      let type = 'text', step , inputmode;
      if (field.type === 'int') type = 'text', step = 1, inputmode = 'numeric';
      else if (field.type === 'float') type = 'text', step = 'any', inputmode = 'decimal';
      Object.entries({ type, step, inputmode }).forEach(([k, v]) => v && !field.attrs?.[k] && (attrs += ` ${k}="${v}"`));
      if (['int', 'float'].includes(field.type)) attrs += ` oninput="JuNeDynamicJSONEditor.inputNumber(event, this, '${field.type}', '${field.attrs?.min ?? ''}')"`;
      if (field.type === 'ipv4') attrs += ` onkeydown="JuNeDynamicJSONEditor.keydownIPv4(event, this)" oninput="JuNeDynamicJSONEditor.inputIPv4(event, this, '${field.mask ?? ''}')"`;
      el = `<input ${attrs} value="${value || ''}">`;
    }

    el = (field.type === 'bool') ? el : `<label for="${id}">${field.text}:</label>${(field.mask) ? ` <span id="${id}_mask">${field.mask}</span>` : ''} ${el}`;
    if (container) container.innerHTML = el;
    else return el;
  }


  static inputNumber(e, input, type, min) {
    let val = input.value;
    val = val.replace(',', '.');
    val = val.replace(/(?!^)-/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts.shift() + '.' + parts.join('');
    let r, m = (min && Number(min) >= 0);
    if (type === 'int') r = (m) ? /[^\d]/g : /[^\d\-]/g;
    else r = (m) ? /[^\d\.]/g : /[^\d\.\-]/g;
    input.value = val.replace(r, '');
  }

  static keydownIPv4(e, el) {
    const k = e.key, v = el.value;
    if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) return;
    if (!/[0-9.]/.test(k) && !(e.ctrlKey || e.metaKey)) return e.preventDefault();
    const parts = v.split('.'), last = parts[parts.length - 1];
    if (parts.length > 4)  return e.preventDefault();
    if (k === '.' && (!last || parts.length === 4))  return e.preventDefault();
    if (last.length === 3) {
	if (parts.length < 4) {
	    e.preventDefault();
	    el.value += '.' + k;
	} else e.preventDefault();
	return;
    }
    if (Number(last + k) > 255) e.preventDefault();
  }

  static inputIPv4(e, el, mask) {
    el.value = el.value.replace(/[^\d.]/g, '').slice(0, 15);
    if (mask) {
      const m = document.getElementById(`${el.id}_mask`);
      m.style.color = (JuNeDynamicJSONEditor.maskIPv4(el.value, m.innerText)) ? '' : 'red';
    }
  }

  static maskIPv4(ip, mask) {
    const toNum = s => s.split('.').reduce((a, b) => a*256+ +b, 0);
    const validOctets = s => {
	const o = s.split('.');
	if (o.length !== 4) return false;
	return o.every(x => /^\d+$/.test(x) && +x >= 0 && +x<= 255 && !(x.length > 1 && x[0] == '0'));
    };
    if (!validOctets(ip) || !validOctets(mask)) return false;
    const bits = mask.split('.').map(x => parseInt(x).toString(2).padStart(8, '0')).join('');
    if (!/^1*0*$/.test(bits) || !bits.includes('1')) return false;

    const ipNum = toNum(ip), maskNum = toNum(mask);
    const net = ipNum & maskNum, broad = net | (~maskNum>>>0);
    return ipNum >= net && ipNum <= broad;
  }

  // --- TREE BUILDER ---
  build() {
    this.container.innerHTML = '';
    this.buildTree(this.schema, this.container, this.prefix);
    this.dynamicListener();
  }

  buildTree(fields, container, prefix) {
    const ul = document.createElement('ul');
    ul.className = 'jstree';

    fields.forEach(f => {
      const li = document.createElement('li');
      li.id = `${prefix}__${f.key}_cnt`;
      if (!['object', 'array'].includes(f.type)) this.makeInput(f, `${prefix}__${f.key}`, f.value, li);
      else if (f.type === 'object') {
	const det = document.createElement('details');
	det.id = `${prefix}__${f.key}`;
	det.open = true;
	const sum = document.createElement('summary');
	sum.textContent = f.text;
	det.appendChild(sum);
	this.buildTree(f.fields, det, `${prefix}__${f.key}`);
	li.appendChild(det);
      }
      else if (f.type === 'array') {
	const det = document.createElement('details');
	det.id = `${prefix}__${f.key}`;
	det.open = true;
	const sum = document.createElement('summary');
	sum.textContent = f.text;
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.textContent = '+ Add';
	btn.className = 'jstree-button';
	btn.onclick = () => this.addArrayItem(f, det, prefix);
	det.append(sum, btn);
	li.appendChild(det);
      }
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  addArrayItem(f, container, prefix) {
    const idx = container.querySelectorAll(`[id^="${prefix}__${f.key}__"]`).length;
    const div = document.createElement('div');
    div.id = `${prefix}__${f.key}__${idx}`;

    if (f.fields.length === 1 && !('key' in f.fields[0])) div.insertAdjacentHTML('beforeend', `<span id="${id}_cnt">` + this.makeInput(f.fields[0], id) + '</span>');
    else this.buildTree(f.fields, div, `${prefix}__${f.key}__${idx}`);

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '⨯';
    del.className = 'jstree-button';
    del.style.background = '#A00';
    del.onclick = () => div.remove();
    div.appendChild(del);
    container.appendChild(div);
  }

  // --- COLLECT DATA ---
  collect() {
    return this.collectFields(this.schema, this.container, this.prefix);
  }

  collectFields(fields, container, prefix) {
    const obj = {};
    fields.forEach(f => {
      if (['string', 'int', 'float', 'bool', 'fixed', 'enum'].includes(f.type)) {
	const el = container.querySelector(`#${prefix}__${f.key}`);
	if (!el) return;
	if (f.type === 'bool') obj[f.key] = el.checked;
	else if (f.type === 'int') obj[f.key] = parseInt(el.value, 10);
	else if (f.type === 'float') obj[f.key] = parseFloat(el.value);
	else obj[f.key] = el.value;
      } else if (f.type === 'object') {
	const det = container.querySelector(`#${prefix}__${f.key}`);
	if (det) obj[f.key] = this.collectFields(f.fields, det, `${prefix}__${f.key}`);
      } else if (f.type === 'array') {
	const det = container.querySelector(`#${prefix}__${f.key}`);
	if (!det) return;
	const arr = [];
	det.querySelectorAll(':scope > div[id^="' + prefix + '__' + f.key + '__"]').forEach((itemDiv, idx) => {
	  const itemId = itemDiv.id;
	  if (f.fields.length === 1 && !('key' in f.fields[0])) {
	    const el = itemDiv.querySelector(`#${itemId}`);
	    if (el) {
	      const t = f.fields[0].type;
	      if (t === 'int') arr.push(parseInt(el.value, 10));
	      else if (t === 'float') arr.push(parseFloat(el.value));
	      else arr.push(el.value);
	    }
	  } else arr.push(this.collectFields(f.fields, itemDiv, itemId));
	});
	obj[f.key] = arr;
      }
    });
    return obj;
  }

  // --- POPULATE DATA ---
  populate(data) {
    this.populateFields(this.schema, this.container, this.prefix, data);
  }

  populateFields(fields, container, prefix, data) {
    fields.forEach(f => {
      if (['string', 'int', 'float', 'bool', 'fixed', 'enum'].includes(f.type)) {
	const el = container.querySelector(`#${prefix}__${f.key}`);
	if (!el) return;
	if (f.type === 'bool') el.checked = !!data[f.key];
	else el.value = data[f.key] ?? '';
      } else if (f.type === 'object') {
	const det = container.querySelector(`#${prefix}__${f.key}`);
	if (det && data[f.key]) this.populateFields(f.fields, det, `${prefix}__${f.key}`, data[f.key]);
      } else if (f.type === 'array') {
	const det = container.querySelector(':scope > details');
	if (det && Array.isArray(data[f.key])) {
	  data[f.key].forEach((item, idx) => {
	    this.addArrayItem(f, det, prefix);
	    const newItem = det.querySelectorAll(':scope > .array-item')[idx];
	    if (f.fields.length === 1 && !('key' in f.fields[0])) {
	      const el = newItem.querySelector(`#${prefix}__${f.key}__${idx}`);
	      if (el) el.value = item;
	    } else this.populateFields(f.fields, newItem, `${prefix}__${f.key}__${idx}`, item);
	  });
	}
      }
    });
  }

  details(open) {
    this.container.querySelectorAll('details').forEach(d => d.open = open);
  }

  dynamicListener() {
    this.container.querySelectorAll('[data-dyjsed-dep]').forEach(el => {
      el.removeAttribute('data-dyjsed-dep');
      el.addEventListener('change', () => this.dynamic(el))
    });
  }

  dynamicChg(fields, path, prefix, value) {
    fields.forEach(f => {
      const id = `${prefix}__${f.key}`;
      if (f.depends_on?.key && f.depends_on?.set && [].concat(f.depends_on.key).includes(path)) {
	Object.keys(f.depends_on.set).forEach(s => f[s] = (typeof f.depends_on.set[s] === 'function') ? f.depends_on.set[s](value) : f.depends_on.set[s]);
	if (f.depends_on.set?.attrs) {
	  f.attrs = { ...f.attrs };
	  Object.keys(f.depends_on.set.attrs).forEach(s => f.attrs[s] = (typeof f.depends_on.set.attrs[s] === 'function') ? f.depends_on.set.attrs[s](value) : f.depends_on.set.attrs[s]);
	}
	this.el(`${id}_cnt`).innerHTML = this.makeInput(f, id, f.value || '');
      }
      if (f.fields) this.dynamicChg(f.fields, path, id, value);
    });
  }

  dynamic(el) {
    const path = el.id.split('__').slice(1).join('/'), value = (el.type === 'checkbox') ? el.checked : el.value;
    this.dynamicChg(this.schema, path, this.prefix, value);
  }
}
